import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { COUNTRIES, MAX_COUNTRIES } from '@/constants/countries';
import { useAppStore } from '@/store/useAppStore';

export function CountryPicker() {
  const selected = useAppStore((s) => s.selectedCountries);
  const setSelected = useAppStore((s) => s.setSelectedCountries);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  const openPicker = () => {
    setDraft(selected);
    setOpen(true);
  };

  const toggle = (code: string) => {
    setDraft((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= MAX_COUNTRIES) return prev;
      return [...prev, code];
    });
  };

  return (
    <>
      <Pressable
        onPress={openPicker}
        className="flex-row items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 active:opacity-70">
        <Icon name="globe-outline" size={16} color="#151412" />
        <Text className="text-sm font-bold text-ink">
          {selected.length} {selected.length === 1 ? 'country' : 'countries'}
        </Text>
        <Icon name="chevron-down" size={14} color="#73706C" />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl bg-surface p-5 pb-8">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-ink">Search countries</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Icon name="close" size={22} color="#151412" />
              </Pressable>
            </View>
            <Text className="mb-3 text-sm text-muted">
              Pick up to {MAX_COUNTRIES}. Each country uses 1 price search (SerpApi quota).
            </Text>

            <ScrollView className="max-h-[380px]">
              {COUNTRIES.map((c) => {
                const on = draft.includes(c.code);
                const disabled = !on && draft.length >= MAX_COUNTRIES;
                return (
                  <Pressable
                    key={c.code}
                    disabled={disabled}
                    onPress={() => toggle(c.code)}
                    className={`mb-2 flex-row items-center justify-between rounded-2xl border px-4 py-3 ${
                      on ? 'border-dark bg-surface-muted' : 'border-border'
                    }`}>
                    <View className="flex-row items-center gap-3">
                      <Text className="text-lg">{c.flag}</Text>
                      <Text className={`text-sm font-bold ${disabled ? 'text-faint' : 'text-ink'}`}>
                        {c.name}
                      </Text>
                    </View>
                    <Icon
                      name={on ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={on ? '#0CAE73' : '#A8A59C'}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => {
                setSelected(draft);
                setOpen(false);
              }}
              className="mt-4 items-center rounded-2xl bg-dark py-3 active:opacity-70">
              <Text className="text-sm font-bold text-white">Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}