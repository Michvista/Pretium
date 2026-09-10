import { StyleSheet, Text } from 'react-native';

import { Fonts, Palette } from '@/constants/theme';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  NGN: '₦',
  GHS: '₵',
  KES: 'KSh ',
  ZAR: 'R',
  CAD: 'C$',
  AUD: 'A$',
};

function formatAmount(amount: number): string {
  const fixed = amount.toFixed(2);
  const [whole, cents] = fixed.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return cents === '00' ? withCommas : `${withCommas}.${cents}`;
}

interface PriceTagProps {
  amount: number;
  currency: string;
  size?: 'small' | 'large';
}

export function PriceTag({ amount, currency, size = 'small' }: PriceTagProps) {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
  return (
    <Text style={[styles.text, size === 'large' && styles.large]}>
      {symbol}
      {formatAmount(amount)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: Fonts.sans,
    color: Palette.text,
  },
  large: {
    fontSize: 22,
  },
});