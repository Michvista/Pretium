import type { PriceResult, Product } from '@/types';

/**
 * Product matching (Phase 6 / Mark's domain).
 *
 * Primary: Mark's REST endpoint (set EXPO_PUBLIC_MATCHING_URL once he
 * deploys it). Returns `{ confidence: 0-1, isMatch: boolean }`.
 *
 * Fallback while Mark's model isn't live: local token-overlap similarity
 * between the product query and each listing title/store. Results below
 * 0.7 confidence are filtered out; >= 0.9 get a "Verified match" badge.
 */

const MATCHING_URL = process.env.EXPO_PUBLIC_MATCHING_URL;

export interface MatchedResult extends PriceResult {
  matchConfidence: number;
}

function tokens(text: string): Set<string> {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

/** Cosine-like overlap on token sets. */
function tokenSimilarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.sqrt(A.size * B.size);
}

async function callMarkEndpoint(
  product: Product,
  listing: PriceResult
): Promise<number | null> {
  if (!MATCHING_URL) return null;
  try {
    const res = await fetch(MATCHING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, listing }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { confidence?: number };
    return typeof json.confidence === 'number' ? json.confidence : null;
  } catch {
    return null;
  }
}

/**
 * Scores each listing against the product, filters below 0.7, and returns
 * results sorted by confidence desc. Uses Mark's endpoint when configured,
 * otherwise the local similarity fallback.
 */
export async function matchListings(
  product: Product,
  results: PriceResult[]
): Promise<MatchedResult[]> {
  const queryText = product.searchQuery || `${product.brand ?? ''} ${product.name}`;
  const matched: MatchedResult[] = [];

  for (const listing of results) {
    let confidence = await callMarkEndpoint(product, listing);
    if (confidence == null) {
      const listingText = `${listing.title ?? ''} ${listing.storeName}`;
      confidence = tokenSimilarity(queryText, listingText);
    }
    matched.push({ ...listing, matchConfidence: confidence });
  }

  return matched
    .filter((m) => m.matchConfidence >= 0.7)
    .sort((a, b) => b.matchConfidence - a.matchConfidence);
}