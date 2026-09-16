import { Image } from 'expo-image';
import { Linking, Pressable, Text, View } from 'react-native';

import { PriceTag } from '@/components/PriceTag';
import type { PriceResult } from '@/types';

interface ResultCardProps {
  result: PriceResult;
  index: number;
}

export function ResultCard({ result, index }: ResultCardProps) {
  const shipping =
    result.shippingCost == null
      ? 'Shipping unavailable'
      : result.shippingCost === 0
        ? 'Free shipping'
        : `Shipping +${formatShipping(result.shippingCost)}`;

  const confidence = (result as PriceResult & { matchConfidence?: number }).matchConfidence;
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  const matchBadge =
    pct == null
      ? null
      : confidence! >= 0.9
        ? { label: `Verified match · ${pct}%`, cls: 'bg-green text-white' }
        : { label: `Possible match · ${pct}%`, cls: 'bg-amber text-white' };

  const openLink = async () => {
    if (!result.productUrl) return;
    try {
      await Linking.openURL(result.productUrl);
    } catch {
      // no-op if browser unavailable
    }
  };

  return (
    <View className="flex-row gap-3 rounded-3xl border border-border bg-surface p-3">
      <View className="h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl bg-surface-muted">
        {result.imageUrl ? (
          <Image
            source={{ uri: result.imageUrl }}
            style={{ width: 72, height: 72 }}
            contentFit="cover"
          />
        ) : (
          <Text className="text-lg font-bold text-faint">#{index + 1}</Text>
        )}
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="shrink text-sm font-bold text-ink" numberOfLines={1}>
            {result.storeName}
          </Text>
          <View className="flex-row items-center gap-2">
            {result.rating != null && (
              <Text className="text-sm font-bold text-amber">
                ★ {result.rating.toFixed(1)}
                {result.ratingCount != null ? ` (${result.ratingCount})` : ''}
              </Text>
            )}
            {matchBadge && (
              <Text className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${matchBadge.cls}`}>
                {matchBadge.label}
              </Text>
            )}
          </View>
        </View>
        {result.title ? (
          <Text className="text-sm text-muted" numberOfLines={2}>
            {result.title}
          </Text>
        ) : null}

        <View className="flex-row items-baseline gap-2">
          <PriceTag amount={result.totalCost} currency={result.currency} size="large" />
          {result.price > 0 && (
            <Text className="text-xs text-muted">base {formatNumber(result.price)}</Text>
          )}
        </View>

        <Text className="text-sm text-muted">{shipping}</Text>

        <Pressable
          onPress={openLink}
          className="mt-1 self-start rounded-2xl bg-dark px-3 py-2 active:opacity-70">
          <Text className="text-sm font-bold text-white">Buy Now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatShipping(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}