import { orchestrateRetrieval } from '@/services/acquisitionOrchestrator';
import { synthesizeQueries } from '@/services/querySynthesis';
import { scrapePrices } from '@/services/scraper';
import { getCachedResults, md5, savePriceHistory, setCachedResults } from '@/services/supabase';
import type { PriceResult, Product } from '@/types';

const API_KEY = process.env.EXPO_PUBLIC_SERPAPI_KEY;

export interface FetchPricesOptions {
  /** 2-letter country code for search localization (e.g. 'us', 'gb', 'ng'). Defaults to 'us'. */
  gl?: string;
  /** Language code for search localization (e.g. 'en', 'fr'). Defaults to 'en'. */
  hl?: string;
  /** Whether to bypass cache. Defaults to false. */
  bypassCache?: boolean;
}

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

export function buildQuery(product: Product): string {
  const { strictQuery } = synthesizeQueries(product);
  return strictQuery;
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

export async function querySerpApiShopping(
  query: string,
  gl: string,
  hl: string
): Promise<PriceResult[]> {
  try {
    const apiKey = process.env.EXPO_PUBLIC_SERPAPI_KEY || API_KEY;
    const params = new URLSearchParams({
      engine: 'google_shopping',
      q: query,
      gl,
      hl,
      direct_link: 'true',
      api_key: apiKey as string,
    });
    const url = `https://serpapi.com/search.json?${params.toString()}`;
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

    return (data.shopping_results ?? [])
      .map(mapResult)
      .filter((r) => r.price > 0 && r.productUrl.length > 0)
      .sort((a, b) => a.totalCost - b.totalCost);
  } catch (error) {
    console.warn('[Pretium] SerpApi fetch failed:', error);
    return [];
  }
}

/**
 * Fetches price results for a product via the SerpApi Google Shopping engine.
 * Results are cached (Supabase, 1h TTL) and sorted cheapest-first.
 * Implements strict retrieval first with automatic fallback to broad query if zero results are returned.
 */
export async function fetchPrices(
  product: Product,
  options: FetchPricesOptions = {}
): Promise<PriceResult[]> {
  const apiKey = process.env.EXPO_PUBLIC_SERPAPI_KEY;
  if (!apiKey) {
    console.warn('[Pretium] EXPO_PUBLIC_SERPAPI_KEY not set — no price results.');
    return [];
  }

  return orchestrateRetrieval(product, options);
}