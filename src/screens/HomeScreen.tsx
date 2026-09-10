import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImagePickerInput, type PickedImage } from '@/components/ImagePickerInput';
import { SearchBar } from '@/components/SearchBar';
import { extractProductFromImage } from '@/services/gemini';
import { extractProductFromLink } from '@/services/linkExtractor';
import { useAppStore } from '@/store/useAppStore';
import type { Product } from '@/types';

type InputMode = 'search' | 'photo' | 'link';

const QUICK_SEARCHES = ['Nike Air Force 1 White', 'iPhone 16 Pro 256GB', 'AirPods Pro 2'];

export default function HomeScreen() {
  const addRecentSearch = useAppStore((s) => s.addRecentSearch);
  const recentSearches = useAppStore((s) => s.recentSearches);
  const checkAndIncrementSearch = useAppStore((s) => s.checkAndIncrementSearch);
  const isPremium = useAppStore((s) => s.isPremium);
  const searchCount = useAppStore((s) => s.searchCount);

  const [mode, setMode] = useState<InputMode>('search');
  const [linkValue, setLinkValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  const finishProduct = (product: Product) => {
    if (!checkAndIncrementSearch()) {
      router.push('/paywall');
      return;
    }
    console.log('[Pretium] Product extracted:', JSON.stringify(product, null, 2));
    addRecentSearch(product);
    router.push({ pathname: '/results', params: { product: JSON.stringify(product) } });
  };

  const handleTextSubmit = (query: string) => {
    finishProduct({
      name: query,
      source: 'text',
      searchQuery: query,
    });
  };

  const handleImage = async (image: PickedImage) => {
    setBusy(true);
    setBusyLabel('Identifying product…');
    try {
      const product = await extractProductFromImage(image.uri, image.base64, image.mimeType);
      finishProduct(product);
    } catch (error) {
      Alert.alert('Could not identify product', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleLinkSubmit = async () => {
    const url = linkValue.trim();
    if (!url) return;
    setBusy(true);
    setBusyLabel('Reading product link…');
    try {
      const product = await extractProductFromLink(url);
      finishProduct(product);
    } catch (error) {
      Alert.alert('Could not read link', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="rounded-b-3xl bg-dark">
        <SafeAreaView edges={['top']}>
          <View className="gap-1 bg-dark px-6 pb-4 pt-4">
            <Text className="text-[32px] font-bold leading-10 text-white">Pretium</Text>
            <Text className="text-sm text-faint">Find the true price of anything, anywhere.</Text>
            {!isPremium && (
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-[13px] text-faint">
                  {Math.max(0, 5 - searchCount)} of 5 free searches left today
                </Text>
                <Pressable onPress={() => router.push('/paywall')} hitSlop={8}>
                  <Text className="text-sm font-bold text-amber">Go Premium →</Text>
                </Pressable>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerClassName="p-6 gap-3" keyboardShouldPersistTaps="handled">
        <View className="flex-row gap-2 rounded-2xl border border-border bg-surface p-0.5">
          {(['search', 'photo', 'link'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              className={`flex-1 items-center rounded-[14px] py-2 ${
                mode === m ? 'bg-surface-muted' : ''
              }`}>
              <Text className={`text-sm font-bold ${mode === m ? 'text-ink' : 'text-muted'}`}>
                {m === 'search' ? 'Search' : m === 'photo' ? 'Photo' : 'Link'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'search' && (
          <View className="gap-3">
            <SearchBar onSubmit={handleTextSubmit} />
            <View className="flex-row flex-wrap gap-2">
              {QUICK_SEARCHES.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => handleTextSubmit(q)}
                  className="rounded-full border border-border bg-surface-muted px-3 py-2 active:opacity-70">
                  <Text className="text-sm text-ink">{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {mode === 'photo' && (
          <View className="gap-3">
            <ImagePickerInput onImage={handleImage} />
            <Text className="text-sm text-muted">
              Screenshot a product from an ad, website, or in a store — AI will identify it.
            </Text>
          </View>
        )}

        {mode === 'link' && (
          <View className="gap-3">
            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 rounded-2xl bg-surface-muted px-4 py-3 text-ink"
                value={linkValue}
                onChangeText={setLinkValue}
                placeholder="Paste an Amazon or Jumia link"
                placeholderTextColor="#73706C"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Pressable
                onPress={handleLinkSubmit}
                className="justify-center rounded-2xl bg-dark px-4 active:opacity-70">
                <Text className="text-sm font-bold text-white">Extract</Text>
              </Pressable>
            </View>
            <Text className="text-sm text-muted">
              Product info is read from the page’s Open Graph tags.
            </Text>
          </View>
        )}

        {recentSearches.length > 0 && (
          <View className="mt-2 gap-1">
            <Text className="text-sm font-bold text-ink">Recent</Text>
            {recentSearches.slice(0, 3).map((p) => (
              <Text key={p.name + p.source} className="text-sm text-muted">
                {p.name}
              </Text>
            ))}
          </View>
        )}

        {busy && (
          <View className="flex-row items-center justify-center gap-2 py-3">
            <ActivityIndicator color="#151412" />
            <Text className="text-sm text-ink">{busyLabel}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}