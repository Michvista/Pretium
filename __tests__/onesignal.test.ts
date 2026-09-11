import { NativeModules } from 'react-native';
import { OneSignal } from 'react-native-onesignal';

import {
  initOneSignal,
  isRegistered,
  loginOneSignal,
  requestNotificationPermission,
} from '../src/services/onesignal';

describe('isRegistered', () => {
  it('returns false for undefined/null/empty ids', () => {
    expect(isRegistered(undefined)).toBe(false);
    expect(isRegistered(null)).toBe(false);
    expect(isRegistered('')).toBe(false);
  });

  it('returns false for the local- placeholder', () => {
    expect(isRegistered('local-abc123')).toBe(false);
  });

  it('returns true for real server-assigned ids', () => {
    expect(isRegistered('e9e8f8a0-1234-5678-9abc-def012345678')).toBe(true);
  });
});

describe('initOneSignal', () => {
  beforeEach(() => {
    NativeModules.OneSignal = {};
  });

  it('initializes with the app id and wires the observer without prompting permission', () => {
    initOneSignal();
    expect(OneSignal.initialize).toHaveBeenCalledWith('test-app-id');
    expect(OneSignal.User.pushSubscription.addEventListener).toHaveBeenCalled();
    expect(OneSignal.Notifications.requestPermission).not.toHaveBeenCalled();
  });
});

describe('requestNotificationPermission', () => {
  beforeEach(() => {
    NativeModules.OneSignal = {};
  });

  it('requests permission through the SDK', async () => {
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(OneSignal.Notifications.requestPermission).toHaveBeenCalledWith(true);
  });
});

describe('loginOneSignal', () => {
  beforeEach(() => {
    NativeModules.OneSignal = {};
  });

  it('logs the user in via the SDK', () => {
    loginOneSignal('user-123');
    expect(OneSignal.login).toHaveBeenCalledWith('user-123');
  });
});