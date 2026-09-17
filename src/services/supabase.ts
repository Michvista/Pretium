import * as Crypto from 'expo-crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type {
  CanonicalProduct,
  PriceResult,
  ProductIdentifiers,
  ProductSpecifications,
  WatchlistItem,
} from '@/types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  }
  return client;
}

/** MD5 hex digest used for cache/history keys. */
export async function md5(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, input);
}

export async function getCachedResults(queryHash: string): Promise<PriceResult[] | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('price_cache')
    .select('results')
    .eq('query_hash', queryHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  const results = data.results as PriceResult[];
  if (!Array.isArray(results)) return null;

  // Normalize / deserialize listing fields so both canonical and alias fields are available
  return results.map((r) => ({
    ...r,
    rawTitle: r.rawTitle ?? r.title,
    title: r.title ?? r.rawTitle,
    listingImageUrl: r.listingImageUrl ?? r.imageUrl ?? null,
    imageUrl: r.imageUrl ?? r.listingImageUrl ?? null,
  }));
}

export async function setCachedResults(queryHash: string, results: PriceResult[]): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  const now = Date.now();
  await supabase.from('price_cache').upsert(
    {
      query_hash: queryHash,
      results,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'query_hash' }
  );
}

export async function savePriceHistory(
  productHash: string,
  results: PriceResult[]
): Promise<void> {
  const supabase = getClient();
  if (!supabase || results.length === 0) return;
  const rows = results.map((r) => ({
    product_hash: productHash,
    store_name: r.storeName,
    price: r.price,
    currency: r.currency || 'USD',
    shipping_cost: r.shippingCost ?? null,
    total_cost: r.totalCost ?? r.price,
    product_url: r.productUrl || null,
    raw_title: r.rawTitle ?? r.title ?? null,
    match_confidence: r.matchConfidence ?? null,
  }));
  const { error } = await supabase.from('price_history').insert(rows);
  if (error) {
    console.warn('[Pretium] Failed to save price history:', error.message);
  }
}

export async function getPriceHistory(
  productHash: string,
  limit: number = 50
): Promise<PriceResult[]> {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_hash', productHash)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    storeName: row.store_name,
    price: Number(row.price),
    currency: row.currency,
    shippingCost: row.shipping_cost != null ? Number(row.shipping_cost) : null,
    totalCost: row.total_cost != null ? Number(row.total_cost) : Number(row.price),
    productUrl: row.product_url ?? '',
    inStock: true,
    rawTitle: row.raw_title ?? undefined,
    title: row.raw_title ?? undefined,
    matchConfidence: row.match_confidence != null ? Number(row.match_confidence) : null,
  }));
}

export async function saveCanonicalProduct(
  productHash: string,
  product: CanonicalProduct
): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('products').upsert(
    {
      product_hash: productHash,
      name: product.name,
      brand: product.brand ?? null,
      model: product.model ?? null,
      category: product.category ?? null,
      condition: product.condition ?? null,
      source: product.source ?? 'text',
      source_url: product.sourceUrl ?? null,
      search_query: product.searchQuery,
      specifications: product.specifications ?? {},
      identifiers: product.identifiers ?? {},
      updated_at: now,
    },
    { onConflict: 'product_hash' }
  );
  if (error) {
    console.warn('[Pretium] Failed to save canonical product:', error.message);
  }
}

export async function getCanonicalProductByHash(
  productHash: string
): Promise<CanonicalProduct | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('product_hash', productHash)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    brand: data.brand ?? null,
    model: data.model ?? null,
    category: data.category ?? null,
    specifications: (data.specifications as ProductSpecifications) ?? {},
    identifiers: (data.identifiers as ProductIdentifiers) ?? {},
    condition: data.condition ?? undefined,
    source: data.source ?? 'text',
    sourceUrl: data.source_url ?? null,
    searchQuery: data.search_query ?? '',
  };
}

export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as WatchlistItem[];
}

export async function addToWatchlist(userId: string, item: WatchlistItem): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  await supabase.from('watchlist').upsert(
    {
      user_id: userId,
      product_name: item.product_name,
      product_hash: item.product_hash,
      target_price: item.target_price,
      current_price: item.current_price,
      currency: item.currency ?? 'USD',
      image_url: item.image_url ?? null,
    },
    { onConflict: 'user_id,product_hash' }
  );
}