import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImagePickerInput, type PickedImage } from '@/components/ImagePickerInput';
import { SearchBar } from '@/components/SearchBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { extractProductFromImage } from '@/services/gemini';
import { extractProductFromLink } from '@/services/linkExtractor';
import { useAppStore } from '@/store/useAppStore';
import type { Product } from '@/types';

type InputMode = 'search' | 'photo' | 'link';

const QUICK_SEARCHES = ['Nike Air Force 1 White', 'iPhone 16 Pro 256GB', 'AirPods Pro 2'];

export default function HomeScreen() {
  const theme = useTheme();
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
    <ThemedView style={styles.container}>
      <ThemedView style={styles.headerBand}>
        <SafeAreaView edges={['top']}>
          <ThemedView style={styles.headerInner}>
            <ThemedText type="subtitle" style={styles.brand}>
              Pretium
            </ThemedText>
            <ThemedText style={styles.tagline}>Find the true price of anything, anywhere.</ThemedText>
            {!isPremium && (
              <ThemedView style={styles.premiumRow}>
                <ThemedText style={styles.premiumHint}>
                  {Math.max(0, 5 - searchCount)} of 5 free searches left today
                </ThemedText>
                <Pressable onPress={() => router.push('/paywall')} hitSlop={8}>
                  <ThemedText style={styles.premiumLink}>Go Premium →</ThemedText>
                </Pressable>
              </ThemedView>
            )}
          </ThemedView>
        </SafeAreaView>
      </ThemedView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.segmented}>
          {(['search', 'photo', 'link'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.segment,
                { backgroundColor: mode === m ? theme.background : 'transparent' },
              ]}>
              <ThemedText
                type="smallBold"
                themeColor={mode === m ? 'text' : 'textSecondary'}>
                {m === 'search' ? 'Search' : m === 'photo' ? 'Photo' : 'Link'}
              </ThemedText>
            </Pressable>
          ))}
        </ThemedView>

        {mode === 'search' && (
          <ThemedView style={styles.panel}>
            <SearchBar onSubmit={handleTextSubmit} />
            <ThemedView style={styles.chips}>
              {QUICK_SEARCHES.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => handleTextSubmit(q)}
                  style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                  <ThemedText type="small">{q}</ThemedText>
                </Pressable>
              ))}
            </ThemedView>
          </ThemedView>
        )}

        {mode === 'photo' && (
          <ThemedView style={styles.panel}>
            <ImagePickerInput onImage={handleImage} />
            <ThemedText type="small" themeColor="textSecondary">
              Screenshot a product from an ad, website, or in a store — AI will identify it.
            </ThemedText>
          </ThemedView>
        )}

        {mode === 'link' && (
          <ThemedView style={styles.panel}>
            <ThemedView style={styles.linkRow}>
              <TextInput
                style={[
                  styles.linkInput,
                  { backgroundColor: theme.backgroundElement, color: theme.text },
                ]}
                value={linkValue}
                onChangeText={setLinkValue}
                placeholder="Paste an Amazon or Jumia link"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Pressable
                onPress={handleLinkSubmit}
                style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>
                  Extract
                </ThemedText>
              </Pressable>
            </ThemedView>
            <ThemedText type="small" themeColor="textSecondary">
              Product info is read from the page’s Open Graph tags.
            </ThemedText>
          </ThemedView>
        )}

        {recentSearches.length > 0 && (
          <ThemedView style={styles.recent}>
            <ThemedText type="smallBold">Recent</ThemedText>
            {recentSearches.slice(0, 3).map((p) => (
              <ThemedText key={p.name + p.source} type="small" themeColor="textSecondary">
                {p.name}
              </ThemedText>
            ))}
          </ThemedView>
        )}

        {busy && (
          <ThemedView style={styles.busy}>
            <ActivityIndicator color={Palette.dark} />
            <ThemedText type="small">{busyLabel}</ThemedText>
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBand: {
    backgroundColor: Palette.dark,
    borderBottomLeftRadius: Radius.large,
    borderBottomRightRadius: Radius.large,
  },
  headerInner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
    backgroundColor: Palette.dark,
  },
  brand: {
    color: '#FFFFFF',
    fontWeight: 700,
  },
  tagline: {
    color: '#A8A59C',
  },
  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  premiumHint: {
    color: '#A8A59C',
    fontSize: 13,
  },
  premiumLink: {
    color: Palette.amber,
    fontWeight: 700,
    fontSize: 14,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  segmented: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderRadius: Radius.medium,
    padding: Spacing.half,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Palette.border,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium - Spacing.half,
  },
  panel: {
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    backgroundColor: Palette.surfaceMuted,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  linkRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  linkInput: {
    flex: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  linkButton: {
    backgroundColor: Palette.dark,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  recent: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
});