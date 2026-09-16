import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import type { ProductTrend } from '@/types';

export function PriceTrendCard({ trend }: { trend: ProductTrend }) {
  const { direction, score, recommendation, history } = trend;
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const meta =
    direction === 'falling'
      ? { label: 'Falling', icon: 'trending-down' as IconName, color: '#0CAE73', scoreCls: 'text-green' }
      : direction === 'rising'
        ? { label: 'Rising', icon: 'trending-up' as IconName, color: '#EB9A30', scoreCls: 'text-amber' }
        : { label: 'Stable', icon: 'remove' as IconName, color: '#73706C', scoreCls: 'text-muted' };

  return (
    <View className="gap-3 rounded-3xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon name={meta.icon} size={20} color={meta.color} />
          <Text className="text-base font-bold text-ink">Price is {meta.label.toLowerCase()}</Text>
        </View>
        <Text className={`text-2xl font-bold ${meta.scoreCls}`}>{score}</Text>
      </View>

      <View className="h-16 flex-row items-end gap-[3px]">
        {history.map((h, i) => (
          <View
            key={`${h.date}-${i}`}
            className="flex-1 rounded-sm bg-amber"
            style={{ height: `${Math.max(8, ((h.price - min) / range) * 100)}%` }}
          />
        ))}
      </View>
      <Text className="text-xs text-faint">
        {history[0]?.date} → {history[history.length - 1]?.date}
      </Text>
      <Text className="text-sm text-muted">{recommendation}</Text>
    </View>
  );
}