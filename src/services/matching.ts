import type { PriceResult, Product } from '@/types';

/**
 * Product matching (Phase 6 / Mark's domain).
 *
 * Confidence is resolved in priority order:
 *   1. Mark's REST endpoint (EXPO_PUBLIC_MATCHING_URL) — `{ confidence }`
 *   2. Gemini semantic embeddings + cosine similarity (batchEmbedContents)
 *   3. Local token-overlap similarity (offline fallback)
 *
 * Results below 0.7 confidence are filtered out; >= 0.9 get a
 * "Verified match" badge, 0.7–0.9 a "Possible match" badge.
 */

const MATCHING_URL = process.env.EXPO_PUBLIC_MATCHING_URL;
const EMBED_MODEL = process.env.EXPO_PUBLIC_GEMINI_EMBED_MODEL ?? 'gemini-embedding-001';
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

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

function tokenSimilarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.sqrt(A.size * B.size);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function embed(texts: string[]): Promise<number[][] | null> {
  if (!GEMINI_KEY || texts.length === 0) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: t }] },
          })),
        }),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { embeddings?: { values?: number[] }[] };
    const values = json.embeddings?.map((e) => e.values ?? []);
    if (!values || values.length !== texts.length) return null;
    return values;
  } catch {
    return null;
  }
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
 * results sorted by confidence desc.
 */
export async function matchListings(
  product: Product,
  results: PriceResult[]
): Promise<MatchedResult[]> {
  const queryText = product.searchQuery || `${product.brand ?? ''} ${product.name}`;

  // 1) Mark's endpoint
  const confidences: (number | null)[] = [];
  for (const listing of results) {
    confidences.push(await callMarkEndpoint(product, listing));
  }

  // 2) Semantic embeddings for the ones Mark didn't score
  const unresolved = results.filter((_, i) => confidences[i] == null);
  let queryVec: number[] | null = null;
  let vecs: (number[] | null)[] = [];
  if (unresolved.length > 0) {
    const texts = [queryText, ...unresolved.map((r) => `${r.title ?? ''} ${r.storeName}`)];
    const all = await embed(texts);
    if (all) {
      queryVec = all[0];
      vecs = all.slice(1);
    }
  }

  // 3) Token fallback for anything still unscored
  let vi = 0;
  const matched: MatchedResult[] = results.map((listing, i) => {
    let confidence = confidences[i];
    if (confidence == null) {
      const vec = vecs[vi];
      if (queryVec && vec) confidence = cosine(queryVec, vec);
      vi++;
    }
    if (confidence == null) {
      confidence = tokenSimilarity(queryText, `${listing.title ?? ''} ${listing.storeName}`);
    }
    return { ...listing, matchConfidence: confidence };
  });

  const filtered = matched
    .filter((m) => m.matchConfidence >= 0.7)
    .sort((a, b) => b.matchConfidence - a.matchConfidence);

  // Never return empty when raw results existed: if nothing cleared the
  // 0.7 bar, surface the best matches so the user still sees options.
  if (filtered.length === 0) {
    return matched.sort((a, b) => b.matchConfidence - a.matchConfidence).slice(0, 5);
  }
  return filtered;
}