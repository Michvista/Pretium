import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { initOneSignal } from '@/services/onesignal';
import { initRevenueCat } from '@/services/revenuecat';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initRevenueCat();
    initOneSignal();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="results" options={{ title: 'Prices' }} />
        <Stack.Screen name="product" options={{ title: 'Details' }} />
        <Stack.Screen name="paywall" options={{ title: 'Go Premium', presentation: 'modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}