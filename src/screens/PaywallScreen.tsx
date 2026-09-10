import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getOfferings, purchasePremium, restorePurchases, revenueCatReady } from '@/services/revenuecat';
import { useAppStore } from '@/store/useAppStore';
import type { PurchasesPackage } from 'react-native-purchases';

const BENEFITS = [
  { icon: 'infinity', label: 'Unlimited daily price searches' },
  { icon: 'bell.badge', label: 'Price drop alerts on your watchlist' },
  { icon: 'chart.line.uptrend.xyaxis', label: 'Price history & trend charts' },
  { icon: 'bookmark', label: 'Saved search history & wishlist' },
] as const;

export default function PaywallScreen() {
  const setPremium = useAppStore((s) => s.setPremium);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOfferings().then((offerings) => {
      const p = offerings?.current?.availablePackages[0];
      if (p) setPkg(p);
    });
  }, []);

  const handlePurchase = async () => {
    if (!revenueCatReady) {
      Alert.alert(
        'Preview mode',
        'Purchases need a development build. For the hackathon you can test with a dev build (eas build) or RevenueCat’s TestFlight/Play testing.'
      );
      return;
    }
    if (!pkg) {
      Alert.alert('No offerings', 'No subscription products are configured yet.');
      return;
    }
    setBusy(true);
    const info = await purchasePremium(pkg);
    setBusy(false);
    if (info?.entitlements.active['premium']) {
      setPremium(true);
      router.back();
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    const info = await restorePurchases();
    setBusy(false);
    if (info?.entitlements.active['premium']) {
      setPremium(true);
      router.back();
    } else {
      Alert.alert('Nothing to restore', 'No previous purchases were found for this account.');
    }
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerClassName="flex-grow justify-center gap-3 p-6">
          <View className="items-center gap-2">
            <Text className="text-[32px] font-bold leading-10 text-ink">Go Premium</Text>
            <Text className="text-center text-sm text-muted">
              Get the full picture before you buy.
            </Text>
          </View>

          <View className="gap-3 rounded-3xl bg-surface-muted p-6">
            {BENEFITS.map((b) => (
              <View key={b.label} className="flex-row items-center gap-3">
                <SymbolView
                  name={{ ios: b.icon, android: 'check_circle', web: 'check_circle' }}
                  tintColor="#0CAE73"
                  size={22}
                />
                <Text className="text-sm text-ink">{b.label}</Text>
              </View>
            ))}
          </View>

          <Text className="text-center text-base text-ink">
            {pkg ? `${pkg.product.priceString} / month` : '$3.99 / month'}
          </Text>

          <Pressable
            onPress={handlePurchase}
            disabled={busy}
            className="items-center justify-center rounded-2xl bg-dark py-3 active:opacity-70">
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-sm font-bold text-white">Go Premium</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleRestore}
            disabled={busy}
            className="items-center rounded-2xl border border-border bg-surface py-3 active:opacity-70">
            <Text className="text-sm font-bold text-ink">Restore Purchases</Text>
          </Pressable>

          <Pressable onPress={() => router.back()} className="items-center py-2">
            <Text className="text-sm text-muted">Maybe Later</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}