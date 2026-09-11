import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';

interface SearchBarProps {
  placeholder?: string;
  onSubmit: (query: string) => void;
}

export function SearchBar({ placeholder = 'Search any product…', onSubmit }: SearchBarProps) {
  const [value, setValue] = useState('');

  const submit = () => {
    const query = value.trim();
    if (!query) return;
    onSubmit(query);
  };

  return (
    <View className="flex-row items-center gap-2">
      <TextInput
        className="flex-1 rounded-2xl bg-surface-muted px-4 py-3 text-ink"
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor="#73706C"
        returnKeyType="search"
        onSubmitEditing={submit}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Pressable
        onPress={submit}
        className="h-12 w-12 items-center justify-center rounded-2xl bg-dark active:opacity-70">
        <Icon name="search" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}