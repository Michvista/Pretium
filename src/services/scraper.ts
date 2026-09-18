import { synthesizeQueries } from '@/services/querySynthesis';
import type { PriceResult, Product } from '@/types';

export interface ScraperOptions {
  /** Request timeout per retailer in milliseconds. Defaults to 6000ms. */
  timeoutMs?: number;
  /** Explicit list of target retailers to query. Defaults to all supported stores. */
  stores?: ('jumia' | 'amazon' | 'bestbuy')[];
}

const DEFAULT_TIMEOUT_MS = 6000;

export function parsePriceString(value?: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const cleaned = String(value).replace(/[,\s]/g, '');
  const match = cleaned.match(/(\d+(\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

export function detectCurrency(value?: string | null): string {
  if (!value) return 'USD';
  if (value.includes('₦') || value.toUpperCase().includes('NGN')) return 'NGN';
  if (value.includes('€') || value.toUpperCase().includes('EUR')) return 'EUR';
  if (value.includes('£') || value.toUpperCase().includes('GBP')) return 'GBP';
  if (value.includes('$') || value.toUpperCase().includes('USD')) return 'USD';
  return 'USD';
}

/**
 * Executes an async operation guarded by an AbortController and strict Promise.race timeout.
 * Guaranteed to never hang or throw on timeout/network failure.
 */
export async function withTimeout<T>(
  promiseFn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      console.warn(`[Pretium] Scraper request timed out after ${timeoutMs}ms.`);
      resolve(fallbackValue);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promiseFn(controller.signal), timeoutPromise]);
    clearTimeout(timer!);
    return result;
  } catch (error: any) {
    clearTimeout(timer!);
    console.warn(`[Pretium] Scraper fetch failed:`, error?.message ?? error);
    return fallbackValue;
  }
}

/**
 * Parses Schema.org JSON-LD scripts embedded in HTML for structured product listings.
 */
export function parseJsonLdListings(html: string, storeName: string): PriceResult[] {
  const results: PriceResult[] = [];
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : data?.itemListElement ?? [data];
      for (const item of items) {
        const productObj = item?.item ?? item;
        if (productObj && (productObj['@type'] === 'Product' || productObj.name)) {
          const offers = productObj.offers;
          const offer = Array.isArray(offers) ? offers[0] : offers;
          const price = parsePriceString(offer?.price ?? productObj.price);
          const url = offer?.url ?? productObj.url ?? '';
          const name = productObj.name ?? '';

          if (price != null && price > 0 && name) {
            const currency = offer?.priceCurrency ?? detectCurrency(String(offer?.price ?? price));
            const imageUrl = Array.isArray(productObj.image)
              ? productObj.image[0]
              : productObj.image ?? null;
            const rating =
              productObj.aggregateRating?.ratingValue != null
                ? Number(productObj.aggregateRating.ratingValue)
                : null;
            const ratingCount =
              productObj.aggregateRating?.reviewCount != null
                ? Number(productObj.aggregateRating.reviewCount)
                : null;

            results.push({
              storeName,
              productUrl: url,
              rawTitle: name,
              title: name,
              listingImageUrl: imageUrl,
              imageUrl,
              price,
              currency,
              shippingCost: null,
              totalCost: price,
              inStock: offer?.availability ? !offer.availability.includes('OutOfStock') : true,
              rating: isNaN(rating as number) ? null : rating,
              ratingCount: isNaN(ratingCount as number) ? null : ratingCount,
            });
          }
        }
      }
    } catch {
      // Ignore JSON parsing errors for malformed scripts
    }
  }

  return results;
}

/**
 * Parses Jumia search catalog HTML into Phase 1 RetailerListing candidates.
 */
export function parseJumiaHtml(html: string): PriceResult[] {
  // First attempt JSON-LD extraction
  const jsonLd = parseJsonLdListings(html, 'Jumia');
  if (jsonLd.length > 0) return jsonLd;

  const results: PriceResult[] = [];
  const articleRegex =
    /<article\b[^>]*class=["'][^"']*prd[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch: RegExpExecArray | null;

  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const block = articleMatch[1];

    // Product link
    const hrefMatch = /<a\b[^>]*href=["']([^"']+)["']/i.exec(block);
    if (!hrefMatch) continue;
    let productUrl = hrefMatch[1];
    if (!productUrl.startsWith('http')) {
      productUrl = `https://www.jumia.com.ng${productUrl.startsWith('/') ? '' : '/'}${productUrl}`;
    }

    // Title
    const nameMatch =
      /<(?:div|h3)\b[^>]*class=["'][^"']*name[^"']*["'][^>]*>([^<]+)<\/(?:div|h3)>/i.exec(block);
    const title = nameMatch ? nameMatch[1].trim() : '';
    if (!title) continue;

    // Price
    const prcMatch =
      /<div\b[^>]*class=["'][^"']*prc[^"']*["'][^>]*>([^<]+)<\/div>/i.exec(block);
    const priceText = prcMatch ? prcMatch[1].trim() : '';
    const price = parsePriceString(priceText);
    if (!price || price <= 0) continue;

    const currency = detectCurrency(priceText);

    // Image URL: check data-src first (lazy-loaded real image), then src (if not base64 placeholder)
    const dataSrcMatch = /<img\b[^>]*\bdata-src=["']([^"']+)["']/i.exec(block);
    const srcMatch = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(block);
    let imageUrl: string | null = null;
    if (dataSrcMatch && dataSrcMatch[1]) {
      imageUrl = dataSrcMatch[1];
    } else if (srcMatch && srcMatch[1] && !srcMatch[1].startsWith('data:')) {
      imageUrl = srcMatch[1];
    }

    // Rating
    const starsMatch =
      /<div\b[^>]*class=["'][^"']*stars[^"']*["'][^>]*>([^<]+)<\/div>/i.exec(block);
    let rating: number | null = null;
    if (starsMatch) {
      const rMatch = starsMatch[1].match(/(\d+(\.\d+)?)/);
      if (rMatch) rating = Number(rMatch[1]);
    }

    // Review count (e.g. "(35)")
    const revMatch = /\((\d+)\)/.exec(block);
    const ratingCount = revMatch ? Number(revMatch[1]) : null;

    results.push({
      storeName: 'Jumia',
      productUrl,
      rawTitle: title,
      title,
      listingImageUrl: imageUrl,
      imageUrl,
      price,
      currency,
      shippingCost: null,
      totalCost: price,
      inStock: true,
      rating,
      ratingCount,
    });
  }

  return results;
}

/**
 * Scrapes Jumia search catalog for candidate listings.
 */
export async function scrapeJumia(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<PriceResult[]> {
  const url = `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`;

  return withTimeout(
    async (signal) => {
      const response = await fetch(url, {
        signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        console.warn(`[Pretium] Jumia HTTP ${response.status}`);
        return [];
      }

      const html = typeof response.text === 'function' ? await response.text() : '';
      return parseJumiaHtml(html);
    },
    timeoutMs,
    []
  );
}

/**
 * Parses Amazon search result HTML into Phase 1 RetailerListing candidates.
 */
export function parseAmazonHtml(html: string): PriceResult[] {
  // Check for anti-bot / captcha challenge
  if (
    html.includes('api-services-support@amazon.com') ||
    html.includes('Robot Check') ||
    html.includes('Type the characters you see in this image') ||
    html.includes('To discuss automated access to Amazon data')
  ) {
    console.warn('[Pretium] Amazon anti-bot challenge detected — returning empty candidates.');
    return [];
  }

  const jsonLd = parseJsonLdListings(html, 'Amazon');
  if (jsonLd.length > 0) return jsonLd;

  const results: PriceResult[] = [];
  // Split HTML by search result container
  const parts = html.split(/<div\b[^>]*data-component-type=["']s-search-result["'][^>]*>/i);

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    // Link and Title
    let productUrl = '';
    let title = '';

    const h2Match = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
    if (h2Match) {
      const linkHrefMatch = /href=["']([^"']+)["']/i.exec(h2Match[1]);
      if (linkHrefMatch) {
        productUrl = linkHrefMatch[1];
        if (!productUrl.startsWith('http')) {
          productUrl = `https://www.amazon.com${productUrl.startsWith('/') ? '' : '/'}${productUrl}`;
        }
      }
      const titleSpanMatch = /<span[^>]*>([^<]+)<\/span>/i.exec(h2Match[1]);
      if (titleSpanMatch) {
        title = titleSpanMatch[1].trim();
      }
    }

    if (!productUrl || !title) {
      const fallbackLink =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i.exec(block);
      if (fallbackLink) {
        productUrl = fallbackLink[1].startsWith('http')
          ? fallbackLink[1]
          : `https://www.amazon.com${fallbackLink[1].startsWith('/') ? '' : '/'}${fallbackLink[1]}`;
        title = fallbackLink[2].trim();
      }
    }

    if (!productUrl || !title) continue;

    // Price
    const priceMatch =
      /<span\b[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]+)<\/span>/i.exec(block);
    const priceText = priceMatch ? priceMatch[1] : '';
    const price = parsePriceString(priceText);
    if (!price || price <= 0) continue;

    const currency = detectCurrency(priceText);

    // Image
    const imgMatch =
      /<img\b[^>]*class=["'][^"']*s-image[^"']*["'][^>]*src=["']([^"']+)["']/i.exec(block);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    // Rating
    const ratingMatch =
      /<span\b[^>]*class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([0-9.]+)\s+out\s+of/i.exec(block);
    const rating = ratingMatch ? Number(ratingMatch[1]) : null;

    // Review count
    const reviewMatch =
      /<span\b[^>]*class=["'][^"']*s-underline-text[^"']*["'][^>]*>([0-9,]+)<\/span>/i.exec(block);
    const ratingCount = reviewMatch ? Number(reviewMatch[1].replace(/,/g, '')) : null;

    results.push({
      storeName: 'Amazon',
      productUrl,
      rawTitle: title,
      title,
      listingImageUrl: imageUrl,
      imageUrl,
      price,
      currency,
      shippingCost: null,
      totalCost: price,
      inStock: true,
      rating,
      ratingCount,
    });
  }

  return results;
}

/**
 * Scrapes Amazon search catalog for candidate listings.
 * Gracefully handles 503/CAPTCHA challenges without failing.
 */
export async function scrapeAmazon(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<PriceResult[]> {
  const url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;

  return withTimeout(
    async (signal) => {
      const response = await fetch(url, {
        signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (response.status === 503) {
        console.warn('[Pretium] Amazon HTTP 503 (anti-bot challenged).');
        return [];
      }

      if (!response.ok) {
        console.warn(`[Pretium] Amazon HTTP ${response.status}`);
        return [];
      }

      const html = typeof response.text === 'function' ? await response.text() : '';
      return parseAmazonHtml(html);
    },
    timeoutMs,
    []
  );
}

/**
 * Parses Best Buy Open API JSON payload into Phase 1 RetailerListing candidates.
 */
export function parseBestBuyApiResponse(data: any): PriceResult[] {
  if (!data || !Array.isArray(data.products)) return [];
  const results: PriceResult[] = [];

  for (const p of data.products) {
    const price = parsePriceString(p.salePrice ?? p.regularPrice);
    const url = p.url ?? '';
    const name = p.name ?? '';

    if (price != null && price > 0 && name && url) {
      results.push({
        storeName: 'Best Buy',
        productUrl: url,
        rawTitle: name,
        title: name,
        listingImageUrl: p.image ?? null,
        imageUrl: p.image ?? null,
        price,
        currency: 'USD',
        shippingCost: null,
        totalCost: price,
        inStock: p.inStoreAvailability !== false,
        rating: p.customerReviewAverage != null ? Number(p.customerReviewAverage) : null,
        ratingCount: p.customerReviewCount != null ? Number(p.customerReviewCount) : null,
      });
    }
  }

  return results;
}

/**
 * Scrapes Best Buy using official Open API if API key is provided, or web search.
 */
export async function scrapeBestBuy(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<PriceResult[]> {
  const apiKey = process.env.EXPO_PUBLIC_BESTBUY_API_KEY;

  if (apiKey) {
    const url = `https://api.bestbuy.com/v1/products((search=${encodeURIComponent(
      query
    )}))?apiKey=${apiKey}&format=json&show=sku,name,salePrice,regularPrice,url,image,customerReviewAverage,customerReviewCount,inStoreAvailability`;

    return withTimeout(
      async (signal) => {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          console.warn(`[Pretium] Best Buy API HTTP ${response.status}`);
          return [];
        }
        const data = await response.json();
        return parseBestBuyApiResponse(data);
      },
      timeoutMs,
      []
    );
  }

  // Without an API key, direct Best Buy search is protected by Akamai anti-bot.
  // We document this limitation and return an empty array gracefully.
  return [];
}

/**
 * Parses ScrapeGraphAI response into Phase 1 RetailerListing candidates.
 */
export function parseScrapeGraphResponse(data: any, defaultStore = 'Retailer'): PriceResult[] {
  if (!data) return [];
  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(data.result)
    ? data.result
    : Array.isArray(data.result?.products)
    ? data.result.products
    : [];

  const results: PriceResult[] = [];

  for (const item of rawItems) {
    const title = item.title ?? item.name ?? '';
    const url = item.url ?? item.link ?? item.productUrl ?? '';
    const price = parsePriceString(item.price);
    if (!title || !url || price == null || price <= 0) continue;

    const currency = item.currency ?? detectCurrency(String(item.price));
    const imageUrl = item.image_url ?? item.imageUrl ?? item.thumbnail ?? null;
    const rating = item.rating != null ? Number(item.rating) : null;
    const ratingCount =
      item.rating_count ?? item.reviewCount != null
        ? Number(item.rating_count ?? item.reviewCount)
        : null;

    results.push({
      storeName: item.storeName ?? item.source ?? defaultStore,
      productUrl: url,
      rawTitle: title,
      title,
      listingImageUrl: imageUrl,
      imageUrl,
      price,
      currency,
      shippingCost: null,
      totalCost: price,
      inStock: true,
      rating: isNaN(rating as number) ? null : rating,
      ratingCount: isNaN(ratingCount as number) ? null : ratingCount,
    });
  }

  return results;
}

/**
 * Scrapes target web URL using ScrapeGraphAI structured extraction API.
 */
export async function scrapeWithScrapeGraph(
  websiteUrl: string,
  targetStore: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<PriceResult[]> {
  const apiKey = process.env.EXPO_PUBLIC_SCRAPEGRAPH_API_KEY;
  if (!apiKey) return [];

  return withTimeout(
    async (signal) => {
      const response = await fetch('https://api.scrapegraphai.com/v1/smartscraper', {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'Sga-Key': apiKey,
        },
        body: JSON.stringify({
          website_url: websiteUrl,
          user_prompt:
            'Extract product listings with title, price, currency, url, image_url, and rating.',
        }),
      });

      if (!response.ok) {
        console.warn(`[Pretium] ScrapeGraphAI HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      return parseScrapeGraphResponse(data, targetStore);
    },
    timeoutMs,
    []
  );
}

/**
 * Main fallback price acquisition function.
 * Called when SerpApi returns zero candidate results for a product.
 * Queries target retailers concurrently under timeout guards, returning
 * raw candidate listings adhering strictly to the Phase 1 listing contract.
 */
export async function scrapePrices(
  product: Product,
  options: ScraperOptions = {}
): Promise<PriceResult[]> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, stores = ['jumia', 'amazon', 'bestbuy'] } = options;
  const { strictQuery, broadQuery } = synthesizeQueries(product);
  const query = strictQuery || broadQuery || product.name || 'product';

  const tasks: Promise<PriceResult[]>[] = [];

  if (stores.includes('jumia')) {
    tasks.push(scrapeJumia(query, timeoutMs));
  }
  if (stores.includes('amazon')) {
    tasks.push(scrapeAmazon(query, timeoutMs));
  }
  if (stores.includes('bestbuy')) {
    tasks.push(scrapeBestBuy(query, timeoutMs));
  }

  const settled = await Promise.allSettled(tasks);
  const candidates: PriceResult[] = [];

  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      candidates.push(...item.value);
    }
  }

  // Sort candidates cheapest-first (preserving Phase 1 presentation contract)
  return candidates.sort((a, b) => a.totalCost - b.totalCost);
}