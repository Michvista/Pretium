import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

import { useAppStore } from '@/store/useAppStore';

const ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? process.env.REVENUECAT_API_KEY_ANDROID;
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? process.env.REVENUECAT_API_KEY_IOS;

/** True once RevenueCat has been configured successfully (dev builds only). */
export let revenueCatReady = false;

/**
 * Configures RevenueCat. Called once on app start.
 * No-op (with a warning) in Expo Go, where the native module isn't available.
 */
export async function initRevenueCat(): Promise<void> {
  try {
    const apiKey = Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
    if (!apiKey) {
      console.warn('[Pretium] RevenueCat API key missing — subscriptions disabled.');
      return;
    }
    await Purchases.configure({ apiKey });
    revenueCatReady = true;
    Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      // Mirror entitlement changes into the app store automatically.
      useAppStore.getState().setPremium(hasPremium(info));
    });
  } catch (error) {
    console.warn('[Pretium] RevenueCat configure failed (expected in Expo Go):', error);
  }
}

function hasPremium(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active['premium']);
}

export async function isPremium(): Promise<boolean> {
  if (!revenueCatReady) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasPremium(info);
  } catch {
    return false;
  }
}

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!revenueCatReady) return null;
  try {
    return await Purchases.getOfferings();
  } catch (error) {
    console.warn('[Pretium] Failed to fetch offerings:', error);
    return null;
  }
}

export async function getAppUserId(): Promise<string> {
  try {
    return await Purchases.getAppUserID();
  } catch {
    return 'anonymous';
  }
}

export async function purchasePremium(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  if (!revenueCatReady) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (error) {
    console.warn('[Pretium] Purchase failed or cancelled:', error);
    return null;
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!revenueCatReady) return null;
  try {
    return await Purchases.restorePurchases();
  } catch (error) {
    console.warn('[Pretium] Restore failed:', error);
    return null;
  }
}