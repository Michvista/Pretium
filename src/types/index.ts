/**
 * Shared TypeScript interfaces for Pretium.
 */

export type ProductSource = 'text' | 'image' | 'link';

export type ProductCondition = 'new' | 'refurbished' | 'used';

export interface ProductIdentifiers {
  gtin?: string | null;
  upc?: string | null;
  mpn?: string | null;
  sku?: string | null;
  asin?: string | null;
}

export type ProductSpecifications = Record<string, string | number>;

/**
 * Canonical product model representing the single source of truth for an
 * identified physical product across text, image, or link lineage.
 */
export interface CanonicalProduct {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  specifications: ProductSpecifications;
  identifiers: ProductIdentifiers;
  condition?: ProductCondition;
  source: ProductSource;
  sourceUrl?: string | null;
  searchQuery: string;
}

/**
 * Product capture interface used across the extraction pipeline and UI.
 * Compatible with CanonicalProduct while preserving legacy/optional fields
 * for current application consumers.
 */
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

  /** Optional reference id when associated with a CanonicalProduct. */
  id?: string;
  /** Structured specifications dictionary. */
  specifications?: ProductSpecifications;
  /** Standard product identifiers (GTIN, UPC, MPN, SKU, ASIN). */
  identifiers?: ProductIdentifiers;
  /** Condition of the product if specified. */
  condition?: ProductCondition;
}

/**
 * Represents an individual retailer offer/listing for a product.
 */
export interface RetailerListing {
  storeName: string;
  productUrl: string;
  inStock: boolean;
  /** Raw listing title from retailer / search engine. */
  rawTitle?: string;
  /** Title alias preserved for backwards compatibility with existing UI / components. */
  title?: string;
  /** Image URL of the retailer listing. */
  listingImageUrl?: string | null;
  /** Image URL alias preserved for backwards compatibility with existing UI / components. */
  imageUrl?: string | null;
  price: number;
  currency: string;
  shippingCost: number | null;
  totalCost: number;
  rating?: number | null;
  ratingCount?: number | null;
  /** Reserved for future matching engine (Phase 6): 0-1 confidence score. Not calculated in Phase 1. */
  matchConfidence?: number | null;
  /** Acquisition source provenance indicating where this candidate originated. */
  retrievalSource?: 'serpapi' | 'scraper' | 'direct_url';
}

/**
 * Active listing representation in the app, aliased to RetailerListing
 * to preserve full compatibility with existing consumers.
 */
export type PriceResult = RetailerListing;

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
