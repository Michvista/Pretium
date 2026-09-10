import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { Spacing, Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SearchBarProps {
  placeholder?: string;
  onSubmit: (query: string) => void;
}

export function SearchBar({ placeholder = 'Search any product…', onSubmit }: SearchBarProps) {
  const theme = useTheme();
  const [value, setValue] = useState('');

  const submit = () => {
    const query = value.trim();
    if (!query) return;
    onSubmit(query);
  };

  return (
    <Pressable style={styles.row} onPress={submit}>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: theme.backgroundElement, color: theme.text },
        ]}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        onSubmitEditing={submit}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Pressable
        onPress={submit}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}>
        <SymbolView
          name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          tintColor="#fff"
          size={20}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: Spacing.three,
    backgroundColor: Palette.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
});