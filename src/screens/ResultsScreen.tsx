import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResultCard } from '@/components/ResultCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const theme = useTheme();

  const [results, setResults] = useState<PriceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('total');

  useEffect(() => {
    let cancelled = false;
    if (!product) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPrices(product).then((prices) => {
      if (cancelled) return;
      setResults(prices);
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
    <ThemedView style={styles.header}>
      {product?.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.heroImage} contentFit="cover" />
      ) : null}
      <ThemedText type="default" style={styles.productName}>
        {product?.name ?? 'Unknown product'}
      </ThemedText>
      {product?.brand ? (
        <ThemedText type="small" themeColor="textSecondary">
          {product.brand}
          {product.color ? ` · ${product.color}` : ''}
        </ThemedText>
      ) : null}

      <ThemedView style={styles.sortRow}>
        {(
          [
            { key: 'total', label: 'Total Price' },
            { key: 'rating', label: 'Store Rating' },
          ] as const
        ).map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setSortMode(s.key)}
            style={[
              styles.sortChip,
              { backgroundColor: sortMode === s.key ? theme.backgroundSelected : 'transparent' },
            ]}>
            <ThemedText
              type="smallBold"
              themeColor={sortMode === s.key ? 'text' : 'textSecondary'}>
              {s.label}
            </ThemedText>
          </Pressable>
        ))}
      </ThemedView>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlashList
          data={sorted}
          keyExtractor={(item, index) => `${item.storeName}-${item.productUrl}-${index}`}
          renderItem={({ item, index }) => <ResultCard result={item} index={index} />}
          ItemSeparatorComponent={() => <ThemedView style={styles.separator} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            loading ? (
              <ThemedView style={styles.center}>
                <ActivityIndicator color={Palette.dark} size="large" />
                <ThemedText type="small" themeColor="textSecondary">
                  Searching retailers…
                </ThemedText>
                {[0, 1, 2, 3].map((i) => (
                  <ThemedView key={i} style={styles.skeleton} />
                ))}
              </ThemedView>
            ) : (
              <ThemedView style={styles.center}>
                <ThemedText type="smallBold">No results found</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Try a more specific product name.
                </ThemedText>
              </ThemedView>
            )
          }
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  heroImage: {
    width: '100%',
    height: 180,
    borderRadius: Radius.large,
  },
  productName: {
    fontWeight: 700,
  },
  sortRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  sortChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  separator: {
    height: Spacing.two,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  skeleton: {
    alignSelf: 'stretch',
    height: 100,
    borderRadius: Radius.large,
    opacity: 0.5,
    backgroundColor: Palette.border,
  },
});