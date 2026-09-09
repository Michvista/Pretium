import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { LogLevel, OneSignal } from 'react-native-onesignal';

/**
 * Centralized OneSignal integration for Pretium.
 * All OneSignal SDK calls go through this module (per SDK best practice).
 *
 * NOTE: The OneSignal native module is only present in development builds
 * (EAS / `expo run:*`). It does not exist in Expo Go, so every call is
 * guarded and logs a warning instead of crashing.
 */

const APP_ID =
  process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ??
  (Constants.expoConfig?.extra?.oneSignalAppId as string | undefined) ??
  process.env.ONESIGNAL_APP_ID;

let integrationDialogShown = false;

/** A real, server-assigned subscription ID is non-empty and not the local- placeholder. */
export function isRegistered(subscriptionId: string | null | undefined): boolean {
  return Boolean(subscriptionId) && !subscriptionId!.startsWith('local-');
}

function showIntegrationCompleteDialog(): void {
  Alert.alert(
    'Your OneSignal SDK integration is complete!',
    'You can now send Push Notifications & In-App Messages through OneSignal. Tap below to enable push notifications.',
    [
      {
        text: 'Got it',
        onPress: () => {
          requestNotificationPermission();
        },
      },
    ],
    { cancelable: false }
  );
}

function maybeShowIntegrationCompleteDialog(subscriptionId: string | null | undefined): void {
  if (isRegistered(subscriptionId) && !integrationDialogShown) {
    integrationDialogShown = true;
    showIntegrationCompleteDialog();
  }
}

/** The only place push permission is requested — from the verification dialog button. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    return await OneSignal.Notifications.requestPermission(true);
  } catch (error) {
    console.warn('[Pretium] OneSignal permission request failed:', error);
    return false;
  }
}

/**
 * Initializes OneSignal and wires up the push-subscription observer.
 * Call once on app start. Does NOT prompt for permission.
 */
export function initOneSignal(): void {
  if (Platform.OS === 'web') {
    console.warn('[Pretium] OneSignal not supported on web in this build.');
    return;
  }
  if (!APP_ID) {
    console.warn('[Pretium] OneSignal App ID missing — set extra.oneSignalAppId in app.json.');
    return;
  }
  try {
    OneSignal.Debug.setLogLevel(LogLevel.Warn);
    OneSignal.initialize(APP_ID);

    // Evaluate current ID immediately (may already be server-assigned) and
    // on every change. Kept alive for the app lifetime (module scope).
    OneSignal.User.pushSubscription.addEventListener('change', (subscription) => {
      maybeShowIntegrationCompleteDialog(subscription.current.id);
    });
    OneSignal.User.pushSubscription.getIdAsync().then(maybeShowIntegrationCompleteDialog);
  } catch (error) {
    console.warn('[Pretium] OneSignal init failed (expected in Expo Go):', error);
  }
}

/** Identify the user (e.g. with a RevenueCat / Supabase user id). */
export function loginOneSignal(userId: string): void {
  try {
    OneSignal.login(userId);
  } catch (error) {
    console.warn('[Pretium] OneSignal login failed:', error);
  }
}

export function logoutOneSignal(): void {
  try {
    OneSignal.logout();
  } catch (error) {
    console.warn('[Pretium] OneSignal logout failed:', error);
  }
}

export function setOneSignalTag(key: string, value: string): void {
  try {
    OneSignal.User.addTag(key, value);
  } catch (error) {
    console.warn('[Pretium] OneSignal addTag failed:', error);
  }
}

export function removeOneSignalTag(key: string): void {
  try {
    OneSignal.User.removeTag(key);
  } catch (error) {
    console.warn('[Pretium] OneSignal removeTag failed:', error);
  }
}