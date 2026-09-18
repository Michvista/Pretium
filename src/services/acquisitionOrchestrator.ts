import { synthesizeQueries } from '@/services/querySynthesis';
import { scrapePrices } from '@/services/scraper';
import { querySerpApiShopping } from '@/services/serpapi';
import { getCachedResults, md5, savePriceHistory, setCachedResults } from '@/services/supabase';
import type { PriceResult, Product } from '@/types';

export interface OrchestratorOptions {
  /** 2-letter country code for localization. Defaults to 'us'. */
  gl?: string;
  /** Language code for localization. Defaults to 'en'. */
  hl?: string;
  /** Whether to bypass the cache. Defaults to false. */
  bypassCache?: boolean;
  /** Overall retrieval timeout budget in milliseconds. Defaults to 4000ms. */
  timeoutMs?: number;
  /** Force fallback scraper execution even if SerpApi returns candidates. Defaults to false. */
  forceScraper?: boolean;
}

export const DEFAULT_TIMEOUT_BUDGET_MS = 4000;

/**
 * Normalizes a listing URL by stripping common marketing/tracking parameters
 * (utm_*, ref, tag, fbclid, etc.) and redundant trailing slashes.
 */
export function normalizeListingUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const TRACKING_PARAMS = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'tag',
      'linkCode',
      'camp',
      'creative',
      'creativeASIN',
      'gclid',
      'fbclid',
    ];
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/';
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return rawUrl.trim().replace(/\/+$/, '');
  }
}

/**
 * Deduplicates candidate listings by normalized product URL.
 * Preserves candidate listings that point to different URLs.
 */
export function deduplicateListingsByUrl(listings: PriceResult[]): PriceResult[] {
  const seen = new Set<string>();
  const deduplicated: PriceResult[] = [];

  for (const listing of listings) {
    const norm = normalizeListingUrl(listing.productUrl);
    if (!seen.has(norm)) {
      seen.add(norm);
      deduplicated.push(listing);
    }
  }

  return deduplicated;
}

/**
 * Constructs a candidate listing from direct URL product capture when applicable.
 */
export function extractDirectUrlCandidate(product: Product): PriceResult | null {
  if (product.source !== 'link' || !product.sourceUrl) {
    return null;
  }

  const price = product.price ?? null;
  if (price == null || price <= 0) {
    return null;
  }

  return {
    storeName: product.brand || 'Direct Retailer',
    productUrl: product.sourceUrl,
    rawTitle: product.name,
    title: product.name,
    listingImageUrl: product.imageUrl ?? null,
    imageUrl: product.imageUrl ?? null,
    price,
    currency: product.currency || 'USD',
    shippingCost: null,
    totalCost: price,
    inStock: true,
    retrievalSource: 'direct_url',
  };
}

/**
 * Acquires candidate listings via SerpApi Google Shopping engine.
 * Tries strict query first, falling back to broad query if 0 results returned.
 * Tags all results with retrievalSource: 'serpapi'.
 */
export async function acquireSerpApiCandidates(
  product: Product,
  gl: string,
  hl: string
): Promise<PriceResult[]> {
  const apiKey = process.env.EXPO_PUBLIC_SERPAPI_KEY;
  if (!apiKey) {
    return [];
  }

  const { strictQuery, broadQuery } = synthesizeQueries(product);

  let results = await querySerpApiShopping(strictQuery, gl, hl);

  if (results.length === 0 && broadQuery && broadQuery !== strictQuery) {
    results = await querySerpApiShopping(broadQuery, gl, hl);
  }

  return results.map((r) => ({
    ...r,
    retrievalSource: 'serpapi' as const,
  }));
}

/**
 * Acquires candidate listings via fallback retailer scrapers.
 * Tags all results with retrievalSource: 'scraper'.
 */
export async function acquireScraperCandidates(
  product: Product,
  timeoutMs: number
): Promise<PriceResult[]> {
  try {
    const results = await scrapePrices(product, { timeoutMs });
    return results.map((r) => ({
      ...r,
      retrievalSource: 'scraper' as const,
    }));
  } catch (error) {
    console.warn('[Pretium] Scraper fallback acquisition failed:', error);
    return [];
  }
}

/**
 * Multi-source retrieval orchestrator for Phase 2 data acquisition.
 * Coordinates direct URL acquisition, primary SerpApi search, and retailer fallback scrapers.
 * Enforces a strict timeout budget, deduplicates identical URLs, attaches source provenance,
 * and sorts candidates cheapest-first.
 *
 * NOTE: Strictly acquisition and aggregation only; no product matching, confidence calculation,
 * or accessory filtering is performed.
 */
export async function orchestrateRetrieval(
  product: Product,
  options: OrchestratorOptions = {}
): Promise<PriceResult[]> {
  const {
    gl = 'us',
    hl = 'en',
    bypassCache = false,
    timeoutMs = DEFAULT_TIMEOUT_BUDGET_MS,
    forceScraper = false,
  } = options;

  const { strictQuery } = synthesizeQueries(product);
  const cacheHash = await md5(`${strictQuery}:${gl}:${hl}`);

  // 1. Cache lookup (1h TTL)
  if (!bypassCache) {
    const cached = await getCachedResults(cacheHash);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  // Acquisition task with cascading sources
  const runAcquisition = async (): Promise<PriceResult[]> => {
    const candidates: PriceResult[] = [];

    // Channel A: Direct URL candidate (if user captured from a link with known price)
    const direct = extractDirectUrlCandidate(product);
    if (direct) {
      candidates.push(direct);
    }

    // Channel B: Primary SerpApi search
    let serpResults: PriceResult[] = [];
    try {
      serpResults = await acquireSerpApiCandidates(product, gl, hl);
    } catch (err) {
      console.warn('[Pretium] SerpApi retrieval failed:', err);
    }

    if (serpResults.length > 0) {
      candidates.push(...serpResults);
    }

    // Channel C: Retailer fallback scrapers (activate when SerpApi yields 0 or forceScraper)
    if (serpResults.length === 0 || forceScraper) {
      let scraperResults: PriceResult[] = [];
      try {
        scraperResults = await acquireScraperCandidates(
          product,
          Math.min(timeoutMs, 3000)
        );
      } catch (err) {
        console.warn('[Pretium] Scraper retrieval failed:', err);
      }

      if (scraperResults.length > 0) {
        candidates.push(...scraperResults);
      }
    }

    // Deduplicate identical listing URLs across sources
    const uniqueCandidates = deduplicateListingsByUrl(candidates);

    // Presentation contract: sort candidates cheapest-first by totalCost
    return uniqueCandidates.sort((a, b) => a.totalCost - b.totalCost);
  };

  // Enforce overall retrieval timeout budget
  const controller = new AbortController();
  let timer: NodeJS.Timeout;

  const timeoutPromise = new Promise<PriceResult[]>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      console.warn(`[Pretium] Retrieval orchestrator exceeded budget (${timeoutMs}ms).`);
      resolve([]);
    }, timeoutMs);
  });

  let finalResults: PriceResult[] = [];
  try {
    finalResults = await Promise.race([runAcquisition(), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }

  // Cache and persist only when valid candidate results were acquired
  if (finalResults.length > 0) {
    await setCachedResults(cacheHash, finalResults);
    const productHash = await md5(
      [product.name, product.brand ?? '', product.model ?? ''].join('|')
    );
    await savePriceHistory(productHash, finalResults);
  }

  return finalResults;
}
