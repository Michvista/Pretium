import { buildSearchQuery } from '@/services/gemini';
import { getCachedResults, md5, savePriceHistory, setCachedResults } from '@/services/supabase';
import type { PriceResult, Product } from '@/types';

const API_KEY = process.env.EXPO_PUBLIC_SERPAPI_KEY;

interface SerpApiShoppingResult {
  title?: string;
  link?: string;
  source?: string;
  price?: string;
  currency?: string;
  thumbnail?: string;
  rating?: number | string;
  reviews?: number | string;
  delivery?: string;
  offers?: { price?: string; retailer?: string }[];
  extensions?: string[];
}

interface SerpApiResponse {
  error?: string;
  shopping_results?: SerpApiShoppingResult[];
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
  const price = parsePriceString(priceText) ?? 0;
  const currency = raw.currency ?? detectCurrency(priceText);
  const shippingCost = parseDeliveryCost(raw.delivery);
  const totalCost = Math.round((price + (shippingCost ?? 0)) * 100) / 100;

  const imageUrl = raw.thumbnail ?? null;

  return {
    storeName: raw.source ?? 'Unknown store',
    price,
    currency,
    shippingCost,
    totalCost,
    productUrl: raw.link ?? '',
    inStock: true,
    rawTitle: raw.title,
    title: raw.title,
    listingImageUrl: imageUrl,
    imageUrl,
    rating: raw.rating != null ? Number(raw.rating) : null,
    ratingCount: raw.reviews != null ? Number(raw.reviews) : null,
  };
}

/**
 * Fetches price results for a product via the SerpApi Google Shopping engine.
 * Results are cached (Supabase, 1h TTL) and sorted cheapest-first.
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

  try {
    const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Pretium] SerpApi HTTP ${response.status}`);
      return [];
    }
    const data = (await response.json()) as SerpApiResponse;
    if (data.error) {
      console.warn('[Pretium] SerpApi error:', data.error);
      return [];
    }

    const results = (data.shopping_results ?? [])
      .map(mapResult)
      .filter((r) => r.price > 0 && r.productUrl.length > 0)
      .sort((a, b) => a.totalCost - b.totalCost);

    await setCachedResults(queryHash, results);
    if (results.length > 0) {
      const productHash = await md5(
        [product.name, product.brand ?? '', product.model ?? ''].join('|')
      );
      await savePriceHistory(productHash, results);
    }
    return results;
  } catch (error) {
    console.warn('[Pretium] SerpApi fetch failed:', error);
    return [];
  }
}