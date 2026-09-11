import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/**
 * Cross-platform icon wrapper (Ionicons via @expo/vector-icons).
 * Works in Expo Go on iOS + Android + web — unlike expo-symbols, which
 * requires a native module that isn't present in the iOS Expo Go runtime.
 */
export function Icon({ name, size = 22, color = '#151412' }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}