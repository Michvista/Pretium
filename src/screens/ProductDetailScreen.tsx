import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { PriceTrendCard } from '@/components/PriceTrendCard';
import { md5 } from '@/services/supabase';
import { getPriceTrend } from '@/services/trend';
import { useAppStore } from '@/store/useAppStore';
import type { Product, ProductTrend } from '@/types';

export default function ProductDetailScreen() {
  const { product: productParam } = useLocalSearchParams<{ product?: string }>();
  const isPremium = useAppStore((s) => s.isPremium);
  const [trend, setTrend] = useState<ProductTrend | null>(null);
  const [loading, setLoading] = useState(false);

  let product: Product | null = null;
  if (productParam) {
    try {
      product = JSON.parse(productParam) as Product;
    } catch {
      product = null;
    }
  }

  useEffect(() => {
    if (!product || !isPremium) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const hash = await md5([product!.name, product!.brand ?? '', product!.model ?? ''].join('|'));
      const t = await getPriceTrend(hash);
      if (!cancelled) {
        setTrend(t);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product, isPremium]);

  return (
    <ScrollView className="flex-1 bg-background p-4" contentContainerClassName="gap-3 pb-8">
      <Text className="text-lg font-bold text-ink">{product?.name ?? 'Unknown product'}</Text>
      {product?.brand ? <Text className="text-sm text-muted">{product.brand}</Text> : null}

      {isPremium ? (
        loading ? (
          <View className="items-center py-6">
            <ActivityIndicator color="#151412" />
          </View>
        ) : trend ? (
          <PriceTrendCard trend={trend} />
        ) : (
          <View className="items-center rounded-3xl border border-border bg-surface p-6">
            <Text className="text-center text-sm text-muted">
              Not enough price history yet. Search this product a few times over a few days to build a
              trend.
            </Text>
          </View>
        )
      ) : (
        <View className="items-center gap-3 rounded-3xl border border-border bg-surface p-6">
          <Text className="text-base font-bold text-ink">Price trends are a premium feature</Text>
          <Text className="text-center text-sm text-muted">
            Upgrade to see 30-day price history, trend direction, and a “good time to buy” score.
          </Text>
          <Pressable
            onPress={() => router.push('/paywall')}
            className="rounded-2xl bg-dark px-4 py-3 active:opacity-70">
            <Text className="text-sm font-bold text-white">Go Premium →</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}