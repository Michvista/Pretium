import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

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
    <View className="flex-1 gap-3 bg-background p-4">
      <Text className="text-lg font-bold text-ink">{product?.name ?? 'Unknown product'}</Text>
      <View className="flex-1 items-center justify-center">
        <Text className="text-sm text-muted">
          Price history and trend chart will render here.
        </Text>
      </View>
    </View>
  );
}