/**
 * Shared TypeScript interfaces for Pretium.
 */

export type ProductSource = 'text' | 'image' | 'link';

export interface Product {
  /** Canonical display name of the product. */
  name: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  size?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** Price seen at capture time, if known (from link OG tags / image). */
  price?: number | null;
  currency?: string;
  /** How this product was captured by the user. */
  source: ProductSource;
  /** The URL the user pasted (for link captures). */
  sourceUrl?: string | null;
  /** Canonical search query used when fetching prices. */
  searchQuery: string;
}

export interface PriceResult {
  storeName: string;
  price: number;
  currency: string;
  shippingCost: number | null;
  totalCost: number;
  productUrl: string;
  inStock: boolean;
  title?: string;
  imageUrl?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  /** Set by Mark's matching model (Phase 6): 0-1 confidence this is the same product. */
  matchConfidence?: number | null;
}

export interface PriceHistoryPoint {
  /** ISO date string for the record (YYYY-MM-DD). */
  date: string;
  price: number;
}

export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface ProductTrend {
  direction: TrendDirection;
  /** 0-100 buy-score: higher = better time to buy. */
  score: number;
  recommendation: string;
  /** Last 30 days of daily prices for the sparkline. */
  history: PriceHistoryPoint[];
}

export interface WatchlistItem {
  user_id: string;
  product_name: string;
  product_hash: string;
  target_price: number;
  current_price: number | null;
  currency?: string;
  image_url?: string | null;
  created_at?: string;
}

export type PriceCacheRow = {
  query_hash: string;
  results: PriceResult[];
  created_at: string;
  expires_at: string;
};
