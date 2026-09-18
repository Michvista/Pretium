import { buildSearchQuery } from '@/services/gemini';
import type { Product, ProductIdentifiers, ProductSpecifications } from '@/types';

export interface ExtractedProductData extends Product {
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | string | null;
  retailer?: string | null;
}

export interface LinkExtractorOptions {
  /** Request timeout in milliseconds. Defaults to 8000ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

export function decodeHtmlEntities(value: string): string {
  if (!value) return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

interface IntermediateProductData {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | string | null;
  siteName?: string | null;
  sku?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  upc?: string | null;
  asin?: string | null;
}

function parsePrice(value?: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const cleaned = String(value).replace(/[,\s]/g, '');
  const match = cleaned.match(/(\d+(\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function normalizeAvailability(
  raw?: string | null
): 'InStock' | 'OutOfStock' | 'PreOrder' | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (
    lower.includes('outofstock') ||
    lower.includes('out_of_stock') ||
    lower.includes('soldout') ||
    lower.includes('discontinued')
  ) {
    return 'OutOfStock';
  }
  if (lower.includes('instock') || lower.includes('in_stock') || lower.includes('available')) {
    return 'InStock';
  }
  if (lower.includes('preorder') || lower.includes('pre_order')) {
    return 'PreOrder';
  }
  return null;
}

/**
 * Extracts product metadata from Schema.org JSON-LD scripts embedded in the HTML.
 */
export function parseJsonLdProduct(html: string): IntermediateProductData | null {
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data['@graph'])
        ? data['@graph']
        : Array.isArray(data.itemListElement)
        ? data.itemListElement
        : [data];

      for (const item of items) {
        const product = item?.item ?? item;
        const type = product?.['@type'];
        const isProduct =
          type === 'Product' ||
          (Array.isArray(type) && type.includes('Product')) ||
          (typeof type === 'string' && type.toLowerCase().endsWith('product'));

        if (isProduct || (product && product.offers && product.name)) {
          const offers = product.offers;
          const offer = Array.isArray(offers) ? offers[0] : offers;

          const price = parsePrice(offer?.price ?? product.price);
          const currency = offer?.priceCurrency ?? product.priceCurrency ?? null;

          const rawBrand = product.brand;
          const brand =
            typeof rawBrand === 'string'
              ? rawBrand.trim()
              : typeof rawBrand?.name === 'string'
              ? rawBrand.name.trim()
              : null;

          const rawImage = product.image;
          const imageUrl = Array.isArray(rawImage)
            ? typeof rawImage[0] === 'string'
              ? rawImage[0]
              : rawImage[0]?.url ?? null
            : typeof rawImage === 'string'
            ? rawImage
            : rawImage?.url ?? null;

          const availability = normalizeAvailability(offer?.availability ?? product.availability);

          const sku = product.sku ? String(product.sku).trim() : null;
          const mpn = product.mpn ? String(product.mpn).trim() : null;
          const gtin = product.gtin ?? product.gtin13 ?? product.gtin14 ?? product.gtin8 ?? null;
          const upc = product.gtin12 ?? null;

          return {
            name: product.name ? decodeHtmlEntities(String(product.name).trim()) : null,
            brand,
            description: product.description
              ? decodeHtmlEntities(String(product.description).trim())
              : null,
            imageUrl,
            price,
            currency: currency ? currency.toUpperCase() : null,
            availability,
            sku,
            mpn,
            gtin: gtin ? String(gtin).trim() : null,
            upc: upc ? String(upc).trim() : null,
          };
        }
      }
    } catch {
      // Ignore JSON parse errors for malformed scripts
    }
  }

  return null;
}

/**
 * Extracts product metadata from HTML microdata tags (itemscope itemtype="...Product").
 */
export function parseMicrodataProduct(html: string): IntermediateProductData | null {
  const productScopeRegex =
    /<[^>]+\bitemscope\b[^>]+\bitemtype=["'][^"']*schema\.org\/Product["'][^>]*>([\s\S]*?)<\/(?:div|main|article|section|body)>/i;
  const scopeMatch = productScopeRegex.exec(html);
  const content = scopeMatch ? scopeMatch[1] : html;

  const extractItemprop = (propName: string): string | null => {
    // Check <... itemprop="propName" (content|href|src)="..." ...>
    const attrRegex = new RegExp(
      `<[^>]+itemprop=["']${propName}["'][^>]+(?:content|href|src)=["']([^"']*)["'][^>]*>`,
      'i'
    );
    const attrMatch = attrRegex.exec(content);
    if (attrMatch) return decodeHtmlEntities(attrMatch[1].trim());

    // Check <... (content|href|src)="..." itemprop="propName" ...>
    const attrFirstRegex = new RegExp(
      `<[^>]+(?:content|href|src)=["']([^"']*)["'][^>]+itemprop=["']${propName}["'][^>]*>`,
      'i'
    );
    const attrFirstMatch = attrFirstRegex.exec(content);
    if (attrFirstMatch) return decodeHtmlEntities(attrFirstMatch[1].trim());

    // Check <tag itemprop="propName">text</tag>
    const textRegex = new RegExp(
      `<[^>]+itemprop=["']${propName}["'][^>]*>([^<]+)<`,
      'i'
    );
    const textMatch = textRegex.exec(content);
    if (textMatch) return decodeHtmlEntities(textMatch[1].trim());

    return null;
  };

  const name = extractItemprop('name');
  if (!name && !scopeMatch) return null;

  const priceRaw = extractItemprop('price');
  const priceCurrency = extractItemprop('priceCurrency');
  const brand = extractItemprop('brand');
  const sku = extractItemprop('sku');
  const mpn = extractItemprop('mpn');
  const gtin = extractItemprop('gtin') ?? extractItemprop('gtin13');
  const description = extractItemprop('description');
  const availabilityRaw = extractItemprop('availability');

  // Image can be in itemprop="image" src="..." or content="..."
  const imgRegex = /<[^>]+itemprop=["']image["'][^>]+(?:src|content)=["']([^"']+)["'][^>]*>/i;
  const imgMatch = imgRegex.exec(content);
  const imageUrl = imgMatch ? imgMatch[1].trim() : null;

  return {
    name,
    brand,
    description,
    imageUrl,
    price: parsePrice(priceRaw),
    currency: priceCurrency ? priceCurrency.toUpperCase() : null,
    availability: normalizeAvailability(availabilityRaw),
    sku,
    mpn,
    gtin,
  };
}

/**
 * Extracts OpenGraph and Twitter card meta tags from HTML.
 */
function parseMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const pattern = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const key = match[1].trim().toLowerCase();
    if (!(key in tags)) tags[key] = decodeHtmlEntities(match[2]);
  }

  // Also match reversed attribute order: content="..." property="..."
  const patternReversed =
    /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']([^"']+)["'][^>]*>/gi;
  while ((match = patternReversed.exec(html)) !== null) {
    const key = match[2].trim().toLowerCase();
    if (!(key in tags)) tags[key] = decodeHtmlEntities(match[1]);
  }

  return tags;
}

export function extractOgTags(html: string): IntermediateProductData {
  const meta = parseMetaTags(html);
  const title =
    meta['og:title'] ?? meta['twitter:title'] ?? meta['title'] ?? null;
  const siteName = meta['og:site_name'] ?? null;
  const description = meta['og:description'] ?? meta['description'] ?? null;
  const image = meta['og:image'] ?? meta['twitter:image'] ?? null;
  const priceRaw = meta['og:price:amount'] ?? meta['product:price:amount'] ?? null;
  const currency = meta['og:price:currency'] ?? meta['product:price:currency'] ?? null;
  const availabilityRaw = meta['product:availability'] ?? null;

  return {
    name: title ? title.trim() : null,
    siteName: siteName ? siteName.trim() : null,
    description: description ? description.trim() : null,
    imageUrl: image ? image.trim() : null,
    price: parsePrice(priceRaw),
    currency: currency ? currency.trim().toUpperCase() : null,
    availability: normalizeAvailability(availabilityRaw),
  };
}

/**
 * Extracts Amazon ASIN from URL if present.
 */
export function extractAsinFromUrl(url: string): string | null {
  const match = /(?:\/dp\/|\/gp\/product\/|\/ASIN\/)([A-Z0-9]{10})/i.exec(url);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Parses raw HTML and URL into unified ExtractedProductData with prioritized layer merging.
 */
export function extractProductFromHtml(html: string, url: string): ExtractedProductData {
  const jsonLd = parseJsonLdProduct(html);
  const microdata = parseMicrodataProduct(html);
  const og = extractOgTags(html);

  // Determine Title / Name: JSON-LD > Microdata > OpenGraph > <title> tag
  let name = jsonLd?.name || microdata?.name || og.name || '';
  if (!name) {
    const titleTagMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (titleTagMatch) {
      name = decodeHtmlEntities(titleTagMatch[1].trim());
    }
  }

  if (!name) {
    throw new Error('No product title found on that page.');
  }

  // Price & Currency: JSON-LD > Microdata > OpenGraph
  const price = jsonLd?.price ?? microdata?.price ?? og.price ?? null;
  const currency = jsonLd?.currency ?? microdata?.currency ?? og.currency ?? 'USD';

  // Brand: JSON-LD > Microdata > OpenGraph siteName
  const brand = jsonLd?.brand || microdata?.brand || og.siteName || null;

  // Description
  const description = jsonLd?.description || microdata?.description || og.description || null;

  // Image URL
  const imageUrl = jsonLd?.imageUrl || microdata?.imageUrl || og.imageUrl || null;

  // Availability
  const availability = jsonLd?.availability || microdata?.availability || og.availability || null;

  // Identifiers
  const asinFromUrl = extractAsinFromUrl(url);
  const sku = jsonLd?.sku || microdata?.sku || null;
  const mpn = jsonLd?.mpn || microdata?.mpn || null;
  const gtin = jsonLd?.gtin || microdata?.gtin || null;
  const upc = jsonLd?.upc || null;

  const identifiers: ProductIdentifiers = {};
  if (sku) identifiers.sku = sku;
  if (mpn) identifiers.mpn = mpn;
  if (gtin) identifiers.gtin = gtin;
  if (upc) identifiers.upc = upc;
  if (asinFromUrl) identifiers.asin = asinFromUrl;

  const specifications: ProductSpecifications = {};
  if (availability) {
    specifications.availability = availability;
  }

  const searchQuery = buildSearchQuery({ name, brand });

  return {
    name,
    brand,
    description,
    imageUrl,
    price,
    currency,
    source: 'link',
    sourceUrl: url,
    searchQuery,
    identifiers: Object.keys(identifiers).length > 0 ? identifiers : undefined,
    specifications: Object.keys(specifications).length > 0 ? specifications : undefined,
    availability,
    retailer: og.siteName || null,
  };
}

/**
 * Fetches a retailer product URL with redirect following, timeout guards, and
 * extracts rich structured product data (JSON-LD, Microdata, OpenGraph, identifiers).
 */
export async function extractProductFromLink(
  url: string,
  options: LinkExtractorOptions = {}
): Promise<ExtractedProductData> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (error: any) {
    clearTimeout(timer);
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      throw new Error(`Request timed out while loading that product link (${timeoutMs}ms).`);
    }
    throw new Error(`Could not load that link: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 403) {
    throw new Error('Could not load that link (HTTP 403 Forbidden: retailer blocked request).');
  }

  if (response.status === 404) {
    throw new Error('Could not load that link (HTTP 404 Not Found).');
  }

  if (!response.ok) {
    throw new Error(`Could not load that link (HTTP ${response.status}).`);
  }

  const canonicalUrl = response.url || url;
  const html = typeof response.text === 'function' ? await response.text() : '';

  return extractProductFromHtml(html, canonicalUrl);
}