import { getPriceHistory } from '@/services/supabase';
import type { PriceHistoryPoint, ProductTrend, TrendDirection } from '@/types';

/**
 * Price trend scoring (Phase 6 / Mark's domain).
 *
 * Primary: Mark's endpoint (EXPO_PUBLIC_TREND_URL) returning
 * `{ trend, score, recommendation, sparkline }`.
 *
 * Fallback: local computation from the product's own price_history
 * (Supabase) using linear-regression slope + recent-vs-earlier momentum.
 */

const TREND_URL = process.env.EXPO_PUBLIC_TREND_URL;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeTrend(history: PriceHistoryPoint[]): ProductTrend {
  const prices = history.map((h) => h.price);
  const n = prices.length;
  const first = prices[0];
  const last = prices[n - 1];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / n;

  // Linear regression slope (per index point)
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += prices[i];
    sxy += i * prices[i];
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const slopePct = avg > 0 ? (slope / avg) * 100 : 0;

  // Momentum: average of recent third vs earlier third
  const third = Math.max(1, Math.floor(n / 3));
  const recent = prices.slice(-third).reduce((a, b) => a + b, 0) / third;
  const earlier = prices.slice(0, third).reduce((a, b) => a + b, 0) / third;

  let direction: TrendDirection;
  if (slopePct <= -0.8) direction = 'falling';
  else if (slopePct >= 0.8) direction = 'rising';
  else {
    const diffPct = first > 0 ? ((last - first) / first) * 100 : 0;
    if (diffPct <= -1.5 && recent <= earlier) direction = 'falling';
    else if (diffPct >= 1.5 && recent >= earlier) direction = 'rising';
    else direction = 'stable';
  }

  let score = 50;
  if (direction === 'falling') {
    score = 60 + Math.min(35, Math.abs(slopePct) * 4 + (last <= min * 1.05 ? 10 : 0));
  } else if (direction === 'rising') {
    score = 20 + Math.min(25, Math.abs(slopePct) * 2);
  } else {
    score = 40 + (last <= min + (max - min) * 0.25 ? 20 : 5);
  }
  score = clamp(Math.round(score), 0, 100);

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