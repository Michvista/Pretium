import type { PriceResult, Product } from '@/types';

/**
 * Fallback price scraping via ScrapeGraphAI.
 * Used when SerpApi returns no results for a product.
 * NOTE: Requires a ScrapeGraphAI API key (EXPO_PUBLIC_SCRAPEGRAPH_API_KEY) and
 * retailer URL targets; this is a placeholder until the pipeline is wired up.
 */
export async function scrapePrices(_product: Product): Promise<PriceResult[]> {
  const apiKey = process.env.EXPO_PUBLIC_SCRAPEGRAPH_API_KEY;
  if (!apiKey) {
    console.warn('[Pretium] EXPO_PUBLIC_SCRAPEGRAPH_API_KEY not set — scraping disabled.');
    return [];
  }
  return [];
}