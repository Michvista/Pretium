import type { Product } from '@/types';

interface OgTags {
  title?: string;
  siteName?: string;
  description?: string;
  image?: string;
  price?: number;
  currency?: string;
  productId?: string;
}

/** Extract <meta property="og:..." content="..."> values from raw HTML. */
function parseMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const pattern = /<meta[^>]+(?:property|name)="([^"]+)"[^>]+content="([^"]*)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const key = match[1].trim().toLowerCase();
    if (!(key in tags)) tags[key] = decodeHtmlEntities(match[2]);
  }
  return tags;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function extractOgTags(html: string): OgTags {
  const meta = parseMetaTags(html);
  const title =
    meta['og:title'] ?? meta['twitter:title'] ?? meta['title'] ?? '';
  const siteName = meta['og:site_name'] ?? '';
  const description = meta['og:description'] ?? meta['description'] ?? '';
  const image = meta['og:image'] ?? meta['twitter:image'] ?? '';
  const priceRaw = meta['og:price:amount'] ?? meta['product:price:amount'] ?? '';
  const currency = meta['og:price:currency'] ?? meta['product:price:currency'] ?? 'USD';
  const price = priceRaw ? Number(priceRaw) : Number.NaN;

  return {
    title: title.trim(),
    siteName: siteName.trim(),
    description: description.trim(),
    image: image.trim(),
    price: Number.isFinite(price) ? price : undefined,
    currency,
  };
}

/** Cleans a retailer title into a tight search query (drops "Buy...", "at Store", attribute phrases). */
function cleanQueryName(title: string): string {
  return title
    .replace(/^buy\s+/i, '')
    .replace(/\s*at\s+[\w.\-]+\s*.*$/i, '')
    .replace(/[|–—-]/g, ',')
    .split(/[,()]/)[0]
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * Fetches a retail URL and maps its Open Graph tags onto a Product.
 * Throws if the page can't be fetched or no title is found.
 */
export async function extractProductFromLink(url: string): Promise<Product> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Could not load that link (HTTP ${response.status}).`);
  }
  const html = await response.text();
  const og = extractOgTags(html);

  if (!og.title) {
    throw new Error('No product title found on that page.');
  }

  const name = og.title;
  const cleanName = cleanQueryName(name);
  return {
    name,
    brand: og.siteName || null,
    description: og.description || null,
    imageUrl: og.image || null,
    price: og.price ?? null,
    currency: og.currency,
    source: 'link',
    sourceUrl: url,
    searchQuery: cleanName,
  };
}