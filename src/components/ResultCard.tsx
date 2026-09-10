import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { PriceTag } from '@/components/PriceTag';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import type { PriceResult } from '@/types';

interface ResultCardProps {
  result: PriceResult;
  index: number;
}

export function ResultCard({ result, index }: ResultCardProps) {
  const shipping = result.shippingCost == null ? 'Shipping unavailable' : result.shippingCost === 0 ? 'Free shipping' : `Shipping +${formatShipping(result.shippingCost)}`;

  const openLink = async () => {
    if (!result.productUrl) return;
    try {
      await Linking.openURL(result.productUrl);
    } catch {
      // no-op if browser unavailable
    }
  };

  return (
    <ThemedView style={styles.card}>
      <ThemedView style={styles.imageWrap}>
        {result.imageUrl ? (
          <Image source={{ uri: result.imageUrl }} style={styles.image} contentFit="cover" />
        ) : (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.indexBadge}>
            #{index + 1}
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView style={styles.body}>
        <ThemedView style={styles.storeRow}>
          <ThemedText type="smallBold" style={styles.storeName} numberOfLines={1}>
            {result.storeName}
          </ThemedText>
          {result.rating != null && (
            <ThemedText type="small" style={styles.rating}>
              ★ {result.rating.toFixed(1)}
              {result.ratingCount != null ? ` (${result.ratingCount})` : ''}
            </ThemedText>
          )}
        </ThemedView>
        {result.title ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {result.title}
          </ThemedText>
        ) : null}

        <ThemedView style={styles.priceRow}>
          <PriceTag amount={result.totalCost} currency={result.currency} size="large" />
          {result.price > 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.basePrice}>
              base {formatNumber(result.price)}
            </ThemedText>
          )}
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary">
          {shipping}
        </ThemedText>

        <Pressable
          onPress={openLink}
          style={({ pressed }) => [styles.buyButton, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            Buy Now
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatShipping(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderRadius: Radius.large,
    padding: Spacing.three,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  imageWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.medium,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceMuted,
  },
  image: {
    width: 72,
    height: 72,
  },
  indexBadge: {
    fontSize: 20,
  },
  body: {
    flex: 1,
    gap: Spacing.one,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  storeName: {
    flexShrink: 1,
  },
  rating: {
    color: Palette.amber,
    fontWeight: 700,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  basePrice: {
    fontSize: 12,
  },
  buyButton: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.dark,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});