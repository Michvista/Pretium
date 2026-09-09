/**
 * Jest setup: mock native modules that don't exist in the Jest environment.
 */

jest.mock('react-native-onesignal', () => {
  const info = {
    OneSignal: {
      initialize: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      Debug: { setLogLevel: jest.fn() },
      User: {
        addTag: jest.fn(),
        removeTag: jest.fn(),
        pushSubscription: {
          addEventListener: jest.fn(),
          getIdAsync: jest.fn(() => Promise.resolve('local-mock')),
        },
      },
      Notifications: {
        requestPermission: jest.fn(() => Promise.resolve(true)),
      },
    },
    LogLevel: { Verbose: 0, Warn: 1, Error: 2, None: 3 },
  };
  return info;
});

jest.mock('react-native-purchases', () => {
  const emptyInfo = { entitlements: { active: {} } };
  return {
    __esModule: true,
    default: {
      configure: jest.fn(),
      addCustomerInfoUpdateListener: jest.fn(),
      getOfferings: jest.fn(() => Promise.resolve({ current: { availablePackages: [] } })),
      getCustomerInfo: jest.fn(() => Promise.resolve(emptyInfo)),
      purchasePackage: jest.fn(() => Promise.resolve({ customerInfo: emptyInfo })),
      restorePurchases: jest.fn(() => Promise.resolve(emptyInfo)),
      getAppUserID: jest.fn(() => Promise.resolve('test-user')),
    },
  };
});

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { MD5: 'MD5' },
  digestStringAsync: jest.fn((algorithm, data) => Promise.resolve(`hash-${data}`)),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { oneSignalAppId: 'test-app-id' } },
  },
}));