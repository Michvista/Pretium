import { buildSearchQuery } from '@/services/gemini';
import type { Product, ProductIdentifiers, ProductSpecifications } from '@/types';

export interface ExtractedProductData extends Product {
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | string | null;
  retailer?: string | null;
  specifications?: ProductSpecifications;
  identifiers?: ProductIdentifiers;
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

export interface IntermediateProductData {
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  color?: string | null;
  size?: string | null;
  material?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  price?: number | null;
  currency?: string | null;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | string | null;
  siteName?: string | null;
  seller?: string | null;
  sku?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  upc?: string | null;
  asin?: string | null;
  specifications?: Record<string, string | number>;
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
 * Checks if a parsed JSON-LD object represents a Schema.org Product.
 */
function isSchemaProduct(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  const rawType = item['@type'];
  if (!rawType) {
    return Boolean(item.offers && item.name);
  }

  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((t) => {
    if (typeof t !== 'string') return false;
    const cleanType = t.replace(/^https?:\/\/schema\.org\//i, '').trim();
    return (
      cleanType === 'Product' ||
      cleanType === 'IndividualProduct' ||
      cleanType === 'ProductModel' ||
      cleanType === 'SomeProducts' ||
      cleanType.endsWith('Product')
    );
  });
}

/**
 * Traverses an arbitrary JSON-LD object to collect Product instances from
 * arrays, @graph, itemListElement, mainEntity, or nested variants.
 */
function collectProductNodes(node: any, results: any[] = []): any[] {
  if (!node || typeof node !== 'object') return results;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectProductNodes(item, results);
    }
    return results;
  }

  if (isSchemaProduct(node)) {
    results.push(node);
  }

  if (node['@graph'] && Array.isArray(node['@graph'])) {
    collectProductNodes(node['@graph'], results);
  }

  if (node.itemListElement && Array.isArray(node.itemListElement)) {
    collectProductNodes(node.itemListElement, results);
  }

  if (node.mainEntity && typeof node.mainEntity === 'object') {
    collectProductNodes(node.mainEntity, results);
  }

  if (node.isVariantOf && typeof node.isVariantOf === 'object') {
    collectProductNodes(node.isVariantOf, results);
  }

  if (node.hasVariant && Array.isArray(node.hasVariant)) {
    collectProductNodes(node.hasVariant, results);
  }

  if (node.item && typeof node.item === 'object') {
    collectProductNodes(node.item, results);
  }

  return results;
}

/**
 * Extracts product metadata from a single Schema.org Product node.
 */
function extractFromJsonLdNode(product: any): IntermediateProductData {
  const specs: Record<string, string | number> = {};

  // AdditionalProperty / PropertyValue key-value pairs
  if (Array.isArray(product.additionalProperty)) {
    for (const prop of product.additionalProperty) {
      if (prop && prop.name && prop.value != null) {
        const key = String(prop.name).trim();
        const val = typeof prop.value === 'number' ? prop.value : String(prop.value).trim();
        if (key && val !== '') {
          specs[key] = val;
        }
      }
    }
  }

  // Model
  const model =
    typeof product.model === 'string'
      ? product.model.trim()
      : typeof product.model?.name === 'string'
      ? product.model.name.trim()
      : null;

  // Brand
  const rawBrand = product.brand ?? product.manufacturer;
  const brand =
    typeof rawBrand === 'string'
      ? rawBrand.trim()
      : typeof rawBrand?.name === 'string'
      ? rawBrand.name.trim()
      : null;

  // Image URL
  const rawImage = product.image;
  let imageUrl: string | null = null;
  if (Array.isArray(rawImage)) {
    imageUrl =
      typeof rawImage[0] === 'string'
        ? rawImage[0]
        : rawImage[0]?.url ?? null;
  } else if (typeof rawImage === 'string') {
    imageUrl = rawImage;
  } else if (rawImage?.url && typeof rawImage.url === 'string') {
    imageUrl = rawImage.url;
  }

  // Visual/Physical Specs
  const color = typeof product.color === 'string' ? product.color.trim() : null;
  const size = typeof product.size === 'string' ? product.size.trim() : null;
  const material = typeof product.material === 'string' ? product.material.trim() : null;
  const category =
    typeof product.category === 'string'
      ? product.category.trim()
      : Array.isArray(product.category)
      ? product.category.join(' > ')
      : null;

  if (color && !specs.color) specs.color = color;
  if (size && !specs.size) specs.size = size;
  if (material && !specs.material) specs.material = material;
  if (model && !specs.model) specs.model = model;

  // Offers
  const offers = product.offers;
  let chosenOffer: any = null;
  if (Array.isArray(offers) && offers.length > 0) {
    chosenOffer = offers.find((o) => o && (o.price != null || o.lowPrice != null)) ?? offers[0];
  } else if (offers && typeof offers === 'object') {
    chosenOffer = offers;
  }

  const priceRaw = chosenOffer?.price ?? chosenOffer?.lowPrice ?? product.price ?? null;
  const price = parsePrice(priceRaw);
  const currencyRaw = chosenOffer?.priceCurrency ?? product.priceCurrency ?? null;
  const currency = currencyRaw ? String(currencyRaw).trim().toUpperCase() : null;
  const rawAvail = chosenOffer?.availability ?? product.availability ?? null;
  const availability = normalizeAvailability(rawAvail);

  const seller =
    typeof chosenOffer?.seller === 'string'
      ? chosenOffer.seller.trim()
      : typeof chosenOffer?.seller?.name === 'string'
      ? chosenOffer.seller.name.trim()
      : null;

  // Identifiers
  const sku = product.sku ? String(product.sku).trim() : null;
  const mpn = product.mpn ? String(product.mpn).trim() : null;
  const gtin = product.gtin ?? product.gtin13 ?? product.gtin14 ?? product.gtin8 ?? null;
  const upc = product.gtin12 ?? null;

  const name = product.name ? decodeHtmlEntities(String(product.name).trim()) : null;
  const description = product.description
    ? decodeHtmlEntities(String(product.description).trim())
    : null;

  return {
    name,
    brand,
    model,
    category,
    color,
    size,
    material,
    description,
    imageUrl,
    url: product.url ? String(product.url).trim() : null,
    price,
    currency,
    availability,
    seller,
    sku,
    mpn,
    gtin: gtin ? String(gtin).trim() : null,
    upc: upc ? String(upc).trim() : null,
    specifications: Object.keys(specs).length > 0 ? specs : undefined,
  };
}

/**
 * Extracts product metadata from Schema.org JSON-LD scripts embedded in HTML.
 * Supports single Product, Product arrays, @graph, and nested variants without crashing on malformed JSON.
 */
export function parseJsonLdProduct(html: string): IntermediateProductData | null {
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  const candidates: IntermediateProductData[] = [];

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const nodes = collectProductNodes(data);
      for (const node of nodes) {
        const extracted = extractFromJsonLdNode(node);
        if (extracted.name || extracted.price != null || extracted.sku || extracted.mpn) {
          candidates.push(extracted);
        }
      }
    } catch {
      // Ignore JSON parse errors for malformed scripts
    }
  }

  if (candidates.length === 0) return null;

  // Prioritize candidates with both name and price, then name and identifiers
  const best =
    candidates.find((c) => c.name && c.price != null) ??
    candidates.find((c) => c.name) ??
    candidates[0];

  return best;
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
    // <... itemprop="propName" (content|href|src)="..." ...>
    const attrRegex = new RegExp(
      `<[^>]+itemprop=["']${propName}["'][^>]+(?:content|href|src)=["']([^"']*)["'][^>]*>`,
      'i'
    );
    const attrMatch = attrRegex.exec(content);
    if (attrMatch) return decodeHtmlEntities(attrMatch[1].trim());

    // <... (content|href|src)="..." itemprop="propName" ...>
    const attrFirstRegex = new RegExp(
      `<[^>]+(?:content|href|src)=["']([^"']*)["'][^>]+itemprop=["']${propName}["'][^>]*>`,
      'i'
    );
    const attrFirstMatch = attrFirstRegex.exec(content);
    if (attrFirstMatch) return decodeHtmlEntities(attrFirstMatch[1].trim());

    // <tag itemprop="propName">text</tag>
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
  const model = extractItemprop('model');
  const color = extractItemprop('color');
  const size = extractItemprop('size');
  const sku = extractItemprop('sku');
  const mpn = extractItemprop('mpn');
  const gtin = extractItemprop('gtin') ?? extractItemprop('gtin13');
  const description = extractItemprop('description');
  const availabilityRaw = extractItemprop('availability');

  const imgRegex = /<[^>]+itemprop=["']image["'][^>]+(?:src|content)=["']([^"']+)["'][^>]*>/i;
  const imgMatch = imgRegex.exec(content);
  const imageUrl = imgMatch ? imgMatch[1].trim() : null;

  const specs: Record<string, string | number> = {};
  if (color) specs.color = color;
  if (size) specs.size = size;
  if (model) specs.model = model;

  return {
    name,
    brand,
    model,
    color,
    size,
    description,
    imageUrl,
    price: parsePrice(priceRaw),
    currency: priceCurrency ? priceCurrency.toUpperCase() : null,
    availability: normalizeAvailability(availabilityRaw),
    sku,
    mpn,
    gtin,
    specifications: Object.keys(specs).length > 0 ? specs : undefined,
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
 * Extracts explicitly stated product attributes from product description or specs text.
 * Preserves literal raw values without normalizing.
 */
export function extractSpecsFromText(text: string): Record<string, string> {
  if (!text || !text.trim()) return {};
  const specs: Record<string, string> = {};

  // Battery life: e.g. "30-hour battery life", "30 hours of battery life"
  const batteryMatch =
    /\b(?:up\s+to\s+)?(\d+(?:[- ]hours?|[- ]hrs?))\s*(?:of\s+)?battery(?:\s*life)?\b/i.exec(text) ||
    /\bbattery(?:\s*life)?\s*(?:of|up\s+to)?\s*(\d+\s*(?:hours?|hrs?))\b/i.exec(text);
  if (batteryMatch) {
    specs.batteryLife = batteryMatch[1].trim();
  }

// Storage: e.g. "256GB storage", "256GB SSD", "1TB storage", "Storage: 512GB"
  const storageRegex = /\b(\d+\s*(?:GB|TB))\s*(?:storage|SSD|internal\s+memory|ROM|capacity)\b/gi;
  let sMatch: RegExpExecArray | null;
  while ((sMatch = storageRegex.exec(text)) !== null) {
    specs.storage = sMatch[1].trim();
    break;
  }
  if (!specs.storage) {
    const storagePrefixRegex = /(?:storage|SSD|internal\s+memory|capacity)\s*(?:of|:)?\s*(\d+\s*(?:GB|TB))\b/i;
    const spMatch = storagePrefixRegex.exec(text);
    if (spMatch) {
      specs.storage = spMatch[1].trim();
    }
  }

  // RAM: e.g. "8GB RAM", "16GB Unified Memory", "36GB Unified Memory"
  const ramMatch =
    /\b(\d+\s*GB)\s*(?:RAM|unified\s+memory|memory)\b/i.exec(text);
  if (ramMatch) {
    specs.ram = ramMatch[1].trim();
  }

  // Screen size: e.g. "6.1-inch display", "15.6 inch screen", "16-inch Liquid Retina"
  const screenMatch =
    /\b(\d+(?:\.\d+)?(?:-inch|\s+inch(?:es)?|["'”]))\s*(?:display|screen|Retina|OLED|AMOLED|touchscreen)?\b/i.exec(text);
  if (screenMatch) {
    const following = text.slice(
      screenMatch.index + screenMatch[0].length,
      screenMatch.index + screenMatch[0].length + 25
    );
    if (
      /display|screen|retina|oled|amoled|touchscreen/i.test(screenMatch[0]) ||
      /display|screen|retina|oled|amoled|touchscreen/i.test(following)
    ) {
      specs.screenSize = screenMatch[1].trim();
    }
  }

  // Processor: e.g. "M3 Max chip", "Snapdragon 8 Gen 3", "Intel Core i7-13700H"
  const cpuMatch =
    /\b((?:Apple\s+)?M[1-4](?:\s+(?:Pro|Max|Ultra))?|Snapdragon\s+\d+(?:\s+Gen\s+\d+)?|Intel\s+Core\s+i[3579](?:-\w+)?|AMD\s+Ryzen\s+[3579](?:\s+\w+)?)\s*(?:chip|processor|CPU)?\b/i.exec(text);
  if (cpuMatch) {
    specs.processor = cpuMatch[1].trim();
  }

  // Connectivity: e.g. "Bluetooth 5.2", "Wi-Fi 6E", "5G"
  const connMatch = /\b(5G|Wi-Fi\s+6E?|Bluetooth\s+\d+\.\d+)\b/i.exec(text);
  if (connMatch) {
    specs.connectivity = connMatch[1].trim();
  }

  // Material: e.g. "Leather", "GORE-TEX", "100% Cotton"
  const materialMatch = /\b(100%\s+Cotton|Leather|GORE-TEX|Stainless\s+Steel|Aluminum)\b/i.exec(text);
  if (materialMatch) {
    specs.material = materialMatch[1].trim();
  }

  return specs;
}

/**
 * Parses raw HTML and URL into unified ExtractedProductData with prioritized layer merging:
 * JSON-LD -> Microdata -> OpenGraph -> <title>.
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

  // Model: JSON-LD > Microdata
  const model = jsonLd?.model || microdata?.model || null;

  // Description: JSON-LD > Microdata > OpenGraph
  const description = jsonLd?.description || microdata?.description || og.description || null;

  // Image URL: JSON-LD > Microdata > OpenGraph
  const imageUrl = jsonLd?.imageUrl || microdata?.imageUrl || og.imageUrl || null;

  // Availability: JSON-LD > Microdata > OpenGraph
  const availability = jsonLd?.availability || microdata?.availability || og.availability || null;

  // Identifiers: JSON-LD > Microdata > ASIN regex from URL
  const asinFromUrl = extractAsinFromUrl(url);
  const sku = jsonLd?.sku || microdata?.sku || null;
  const mpn = jsonLd?.mpn || microdata?.mpn || null;
  const gtin = jsonLd?.gtin || microdata?.gtin || null;
  const upc = jsonLd?.upc || microdata?.upc || null;

  const identifiers: ProductIdentifiers = {};
  if (sku) identifiers.sku = sku;
  if (mpn) identifiers.mpn = mpn;
  if (gtin) identifiers.gtin = gtin;
  if (upc) identifiers.upc = upc;
  if (asinFromUrl) identifiers.asin = asinFromUrl;

  // Structured Specifications: JSON-LD additionalProperty + Microdata specs + explicit description text
  const specifications: ProductSpecifications = {};
  if (availability) {
    specifications.availability = availability;
  }
  if (model) {
    specifications.model = model;
  }

  if (jsonLd?.specifications) {
    Object.assign(specifications, jsonLd.specifications);
  }
  if (microdata?.specifications) {
    for (const [k, v] of Object.entries(microdata.specifications)) {
      if (!specifications[k]) specifications[k] = v;
    }
  }

  // Extract explicit attributes from description
  if (description) {
    const descSpecs = extractSpecsFromText(description);
    for (const [k, v] of Object.entries(descSpecs)) {
      if (!specifications[k]) {
        specifications[k] = v;
      }
    }
  }

  // Extract explicit attributes from title / name if still missing
  if (name) {
    const nameSpecs = extractSpecsFromText(name);
    for (const [k, v] of Object.entries(nameSpecs)) {
      if (!specifications[k]) {
        specifications[k] = v;
      }
    }
  }

  const searchQuery = buildSearchQuery({ name, brand });

  return {
    name,
    brand,
    model,
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
    retailer: jsonLd?.seller || og.siteName || null,
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