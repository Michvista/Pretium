import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.hero}>
            <ThemedText type="subtitle" style={styles.center}>
              Go Premium
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              Get the full picture before you buy.
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            {BENEFITS.map((b) => (
              <ThemedView key={b.label} style={styles.benefit}>
                <SymbolView
                  name={{ ios: b.icon, android: 'check_circle', web: 'check_circle' }}
                  tintColor={Palette.green}
                  size={22}
                />
                <ThemedText type="small">{b.label}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>

          <ThemedText type="default" style={styles.center}>
            {pkg ? `${pkg.product.priceString} / month` : '$3.99 / month'}
          </ThemedText>

          <Pressable
            onPress={handlePurchase}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || busy) && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                Go Premium
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            onPress={handleRestore}
            disabled={busy}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold">Restore Purchases</ThemedText>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.maybeLater}>
            <ThemedText type="small" themeColor="textSecondary">
              Maybe Later
            </ThemedText>
          </Pressable>
        </ScrollView>
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
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    flexGrow: 1,
    justifyContent: 'center',
  },
  hero: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  card: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  primaryButton: {
    backgroundColor: Palette.dark,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  maybeLater: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});