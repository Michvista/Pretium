import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResultCard } from '@/components/ResultCard';
import { matchListings, type MatchedResult } from '@/services/matching';
import { fetchPrices } from '@/services/serpapi';
import type { PriceResult, Product } from '@/types';

type SortMode = 'total' | 'rating';

function parseProduct(param?: string): Product | null {
  if (!param) return null;
  try {
    return JSON.parse(param) as Product;
  } catch {
    return null;
  }
}

export default function ResultsScreen() {
  const { product: productParam } = useLocalSearchParams<{ product?: string }>();
  const product = useMemo(() => parseProduct(productParam), [productParam]);

  const [results, setResults] = useState<MatchedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('total');

  useEffect(() => {
    let cancelled = false;
    if (!product) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPrices(product)
      .then((prices: PriceResult[]) => matchListings(product, prices))
      .then((matched) => {
        if (cancelled) return;
        setResults(matched);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

  const sorted = useMemo(() => {
    const list = [...results];
    if (sortMode === 'total') list.sort((a, b) => a.totalCost - b.totalCost);
    else list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return list;
  }, [results, sortMode]);

  const header = (
    <View className="mb-3 gap-2">
      {product?.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} className="h-[180px] w-full rounded-3xl" contentFit="cover" />
      ) : null}
      <Text className="text-lg font-bold text-ink">{product?.name ?? 'Unknown product'}</Text>
      {product?.brand ? (
        <Text className="text-sm text-muted">
          {product.brand}
          {product.color ? ` · ${product.color}` : ''}
        </Text>
      ) : null}

      <View className="mt-1 flex-row flex-wrap gap-2">
        {(
          [
            { key: 'total', label: 'Total Price' },
            { key: 'rating', label: 'Store Rating' },
          ] as const
        ).map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setSortMode(s.key)}
            className={`rounded-full border border-border px-3 py-2 ${
              sortMode === s.key ? 'bg-surface-muted' : 'bg-transparent'
            }`}>
            <Text className={`text-sm font-bold ${sortMode === s.key ? 'text-ink' : 'text-muted'}`}>
              {s.label}
            </Text>
          </Pressable>
        ))}
        {product && (
          <Pressable
            onPress={() => router.push({ pathname: '/product', params: { product: JSON.stringify(product) } })}
            className="rounded-full bg-dark px-3 py-2 active:opacity-70">
            <Text className="text-sm font-bold text-white">Price trend →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <FlashList
          data={sorted}
          keyExtractor={(item, index) => `${item.storeName}-${item.productUrl}-${index}`}
          renderItem={({ item, index }) => <ResultCard result={item} index={index} />}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            loading ? (
              <View className="items-center justify-center gap-3 py-8">
                <ActivityIndicator color="#151412" size="large" />
                <Text className="text-sm text-muted">Searching retailers…</Text>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} className="h-[100px] w-full self-stretch rounded-3xl bg-border opacity-50" />
                ))}
              </View>
            ) : (
              <View className="items-center justify-center gap-3 py-8">
                <Text className="text-sm font-bold text-ink">No results found</Text>
                <Text className="text-sm text-muted">Try a more specific product name.</Text>
              </View>
            )
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        />
      </SafeAreaView>
    </View>
  );
}