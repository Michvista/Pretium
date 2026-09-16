import { getPriceHistory } from '@/services/supabase';
import type { PriceHistoryPoint, ProductTrend, TrendDirection } from '@/types';

/**
 * Price trend scoring (Phase 6 / Mark's domain).
 *
 * Primary: Mark's endpoint (set EXPO_PUBLIC_TREND_URL) returning
 * `{ trend, score, recommendation, sparkline }`.
 *
 * Fallback while his model isn't live: computes trend direction + a
 * 0-100 buy-score + recommendation from the product's own price_history
 * stored in Supabase (linear-ish change + position-vs-range heuristics).
 */

const TREND_URL = process.env.EXPO_PUBLIC_TREND_URL;

export function computeTrend(history: PriceHistoryPoint[]): ProductTrend {
  const prices = history.map((h) => h.price);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;

  let direction: TrendDirection;
  if (pctChange <= -3) direction = 'falling';
  else if (pctChange >= 3) direction = 'rising';
  else direction = 'stable';

  let score = 50;
  if (direction === 'falling') score = 60 + Math.min(35, Math.abs(pctChange) * 3);
  else if (direction === 'stable') score = 40 + (last <= min + (max - min) * 0.2 ? 20 : 5);
  else score = 20 + Math.min(25, Math.abs(pctChange) * 2);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation: string;
  if (direction === 'falling' && last <= min * 1.05) {
    recommendation = 'Near the lowest price seen. Good time to buy.';
  } else if (direction === 'falling') {
    recommendation = 'Price has been dropping — waiting a little longer may pay off.';
  } else if (direction === 'rising') {
    recommendation = 'Price is trending up. Buy soon if you want it now.';
  } else {
    recommendation = 'Price is stable. Fine to buy if you need it.';
  }

  return { direction, score, recommendation, history };
}

/** Fetches the 30-day price trend for a product. Returns null if not enough data. */
export async function getPriceTrend(productHash: string): Promise<ProductTrend | null> {
  if (TREND_URL) {
    try {
      const res = await fetch(TREND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_hash: productHash }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as ProductTrend;
        if (json && json.direction) return json;
      }
    } catch {
      // fall through to local computation
    }
  }

  const history = await getPriceHistory(productHash, 30);
  if (history.length < 2) return null;
  return computeTrend(history);
}