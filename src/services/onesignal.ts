import Constants from 'expo-constants';
import { Alert, NativeModules, Platform } from 'react-native';

import type { LogLevel as LogLevelType, OneSignal as OneSignalType } from 'react-native-onesignal';

/**
 * Centralized OneSignal integration for Pretium.
 * All OneSignal SDK calls go through this module (per SDK best practice).
 *
 * NOTE: The OneSignal native module is only present in development builds
 * (EAS / `expo run:*`) and Android Expo Go. On iOS Expo Go it is absent,
 * and merely evaluating the react-native-onesignal package throws (its
 * module scope builds a NativeEventEmitter from the missing native module).
 * So we check `NativeModules.OneSignal` first and never require the package
 * when it's missing.
 */

const APP_ID =
  process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ??
  (Constants.expoConfig?.extra?.oneSignalAppId as string | undefined) ??
  process.env.ONESIGNAL_APP_ID;

let integrationDialogShown = false;
let onesignalLoaded = false;
let OneSignal: typeof OneSignalType | null = null;
let LogLevel: typeof LogLevelType | null = null;

/** Lazily loads react-native-onesignal. Returns null (with a warning) if unavailable. */
function getOneSignal(): typeof OneSignalType | null {
  if (!onesignalLoaded) {
    onesignalLoaded = true;
    // Evaluating react-native-onesignal at module scope throws when the
    // native module is missing (iOS Expo Go). Guard before requiring.
    if (!NativeModules.OneSignal) {
      console.warn(
        '[Pretium] OneSignal native module not present — push notifications disabled ' +
          '(expected in iOS Expo Go; use a development build).'
      );
      return OneSignal;
    }
    try {
      const mod = require('react-native-onesignal');
      OneSignal = mod.OneSignal;
      LogLevel = mod.LogLevel;
    } catch (error) {
      console.warn('[Pretium] Failed to load react-native-onesignal:', error);
    }
  }
  return OneSignal;
}

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
  const os = getOneSignal();
  if (!os) return false;
  try {
    return await os.Notifications.requestPermission(true);
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
  const os = getOneSignal();
  if (!os) return;

  try {
    os.Debug.setLogLevel(LogLevel ? LogLevel.Warn : 1);
    os.initialize(APP_ID);

    // Evaluate current ID immediately (may already be server-assigned) and
    // on every change. Kept alive for the app lifetime (module scope).
    os.User.pushSubscription.addEventListener('change', (subscription) => {
      maybeShowIntegrationCompleteDialog(subscription.current.id);
    });
    os.User.pushSubscription.getIdAsync().then(maybeShowIntegrationCompleteDialog);
  } catch (error) {
    console.warn('[Pretium] OneSignal init failed (expected in Expo Go):', error);
  }
}

/** Identify the user (e.g. with a RevenueCat / Supabase user id). */
export function loginOneSignal(userId: string): void {
  const os = getOneSignal();
  if (!os) return;
  try {
    os.login(userId);
  } catch (error) {
    console.warn('[Pretium] OneSignal login failed:', error);
  }
}

export function logoutOneSignal(): void {
  const os = getOneSignal();
  if (!os) return;
  try {
    os.logout();
  } catch (error) {
    console.warn('[Pretium] OneSignal logout failed:', error);
  }
}

export function setOneSignalTag(key: string, value: string): void {
  const os = getOneSignal();
  if (!os) return;
  try {
    os.User.addTag(key, value);
  } catch (error) {
    console.warn('[Pretium] OneSignal addTag failed:', error);
  }
}

export function removeOneSignalTag(key: string): void {
  const os = getOneSignal();
  if (!os) return;
  try {
    os.User.removeTag(key);
  } catch (error) {
    console.warn('[Pretium] OneSignal removeTag failed:', error);
  }
}