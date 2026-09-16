import { buildSearchQuery } from '@/services/gemini';
import { getCachedResults, md5, savePriceHistory, setCachedResults } from '@/services/supabase';
import type { PriceResult, Product } from '@/types';

const API_KEY = process.env.EXPO_PUBLIC_SERPAPI_KEY;

interface SerpApiShoppingResult {
  title?: string;
  link?: string;
  product_link?: string;
  product_id?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  currency?: string;
  thumbnail?: string;
  rating?: number | string;
  reviews?: number | string;
  delivery?: string;
  offers?: { price?: string; retailer?: string }[];
  extensions?: string[];
}

interface SerpApiOrganicResult {
  title?: string;
  link?: string;
  source?: string;
  snippet?: string;
}

interface SerpApiResponse {
  error?: string;
  shopping_results?: SerpApiShoppingResult[];
  organic_results?: SerpApiOrganicResult[];
}

function buildQuery(product: Product): string {
  if (product.searchQuery?.trim()) return product.searchQuery.trim();
  return buildSearchQuery(product);
}

function parsePriceString(value?: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[,\s]/g, '');
  const match = cleaned.match(/(\d+(\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function detectCurrency(value?: string): string {
  if (!value) return 'USD';
  if (value.includes('€')) return 'EUR';
  if (value.includes('£')) return 'GBP';
  if (value.includes('₦')) return 'NGN';
  if (value.includes('$')) return 'USD';
  return 'USD';
}

function parseDeliveryCost(delivery?: string): number | null {
  if (!delivery) return null;
  const lower = delivery.toLowerCase();
  if (lower.includes('free')) return 0;
  const match = delivery.replace(/[,\s]/g, '').match(/(\d+(\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function mapResult(raw: SerpApiShoppingResult): PriceResult {
  const priceText = raw.price ?? raw.offers?.[0]?.price;
  const price = parsePriceString(priceText) ?? raw.extracted_price ?? 0;
  const currency = raw.currency ?? detectCurrency(priceText);
  const shippingCost = parseDeliveryCost(raw.delivery);
  const totalCost = Math.round((price + (shippingCost ?? 0)) * 100) / 100;

  return {
    storeName: raw.source ?? 'Unknown store',
    price,
    currency,
    shippingCost,
    totalCost,
    productUrl: raw.product_link ?? raw.link ?? '',
    inStock: true,
    title: raw.title,
    imageUrl: raw.thumbnail ?? null,
    rating: raw.rating != null ? Number(raw.rating) : null,
    ratingCount: raw.reviews != null ? Number(raw.reviews) : null,
  };
}

async function callSerpApi(url: string): Promise<SerpApiResponse | null> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        await delay(600 * (attempt + 1));
        continue;
      }
      const data = (await response.json()) as SerpApiResponse;
      // SerpApi sometimes transiently returns "Google hasn't returned any
      // results" — retry before giving up.
      if (data.error || !data.shopping_results) {
        if (attempt < MAX_ATTEMPTS - 1) {
          await delay(800 * (attempt + 1));
          continue;
        }
      }
      return data;
    } catch {
      if (attempt >= MAX_ATTEMPTS - 1) return null;
      await delay(600 * (attempt + 1));
    }
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches price results for a product via the SerpApi Google Shopping engine.
 * Results are cached (Supabase, 1h TTL) and sorted cheapest-first.
 * Falls back to organic results when the shopping engine returns nothing.
 */
export async function fetchPrices(product: Product): Promise<PriceResult[]> {
  const query = buildQuery(product);
  const queryHash = await md5(query);

  const cached = await getCachedResults(queryHash);
  if (cached && cached.length > 0) return cached;

  if (!API_KEY) {
    console.warn('[Pretium] EXPO_PUBLIC_SERPAPI_KEY not set — no price results.');
    return [];
  }

  // gl=us&hl=en force US Google Shopping regardless of the requester's IP —
  // otherwise SerpApi geo-locates by IP and some regions return no results.
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&gl=us&hl=en&api_key=${API_KEY}`;
  const data = await callSerpApi(url);
  if (!data) {
    console.warn('[Pretium] SerpApi unreachable after retries.');
    return [];
  }
  if (data.error) {
    console.warn('[Pretium] SerpApi error:', data.error);
    return [];
  }

  let shopping = data.shopping_results ?? [];
  if (shopping.length === 0 && (data.organic_results ?? []).length > 0) {
    console.warn('[Pretium] No shopping results — falling back to organic results.');
    shopping = (data.organic_results ?? []).map((o) => ({
      title: o.title,
      link: o.link,
      source: o.source ?? 'Web',
      thumbnail: undefined,
    }));
  }

  const results = shopping
    .map(mapResult)
    .filter((r) => r.price > 0 && r.productUrl.length > 0)
    .sort((a, b) => a.totalCost - b.totalCost);

  if (results.length === 0 && shopping.length > 0) {
    console.warn(
      `[Pretium] SerpApi returned ${shopping.length} items but none had both price and URL.`
    );
  }

  await setCachedResults(queryHash, results);
  if (results.length > 0) {
    const productHash = await md5(
      [product.name, product.brand ?? '', product.model ?? ''].join('|')
    );
    await savePriceHistory(productHash, results);
  }
  return results;
}