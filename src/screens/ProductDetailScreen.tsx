import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Product } from '@/types';

export default function ProductDetailScreen() {
  const { product: productParam } = useLocalSearchParams<{ product?: string }>();
  let product: Product | null = null;
  if (productParam) {
    try {
      product = JSON.parse(productParam) as Product;
    } catch {
      product = null;
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="default">{product?.name ?? 'Unknown product'}</ThemedText>
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Price history and trend chart will render here.
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});