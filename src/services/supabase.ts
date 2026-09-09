import * as Crypto from 'expo-crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { PriceResult, WatchlistItem } from '@/types';

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
  return (data.results as PriceResult[]) ?? null;
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
    currency: r.currency,
  }));
  await supabase.from('price_history').insert(rows);
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
    },
    { onConflict: 'user_id,product_hash' }
  );
}