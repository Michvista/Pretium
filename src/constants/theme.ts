/**
 * Pretium design tokens — warm minimal marketplace style.
 * Inspired by the reference UI: warm off-white background, warm neutral greys,
 * near-black warm text, dark header, amber/green/blue accents.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Palette = {
  /** Warm off-white app background. */
  background: '#FBFAF6',
  /** Pure white cards on the warm background. */
  surface: '#FFFFFF',
  /** Muted warm surface (secondary cards, search field). */
  surfaceMuted: '#F1EEE7',
  /** Warm border / selected surface. */
  border: '#E7E4DA',
  /** Primary text — warm near-black. */
  text: '#151412',
  /** Secondary text. */
  textSecondary: '#73706C',
  /** Tertiary / hints. */
  textTertiary: '#A8A59C',
  /** Dark surfaces (header band, primary CTA). */
  dark: '#151412',
  /** Raised dark surface. */
  darkRaised: '#2E2E2D',
  /** Amber accent — ratings, sale badges, highlights. */
  amber: '#EB9A30',
  /** Green accent — positive, in stock, savings. */
  green: '#0CAE73',
  /** Blue accent — links, info. */
  blue: '#1868FB',
  rating: '#EB9A30',
} as const;

export const Colors = {
  light: {
    text: Palette.text,
    background: Palette.background,
    backgroundElement: Palette.surfaceMuted,
    backgroundSelected: Palette.border,
    textSecondary: Palette.textSecondary,
  },
  dark: {
    text: Palette.background,
    background: Palette.dark,
    backgroundElement: Palette.darkRaised,
    backgroundSelected: '#53524F',
    textSecondary: Palette.textTertiary,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Card corner radius. */
export const Radius = {
  small: 8,
  medium: 16,
  large: 24,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;