export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

/** Google Shopping `gl` country codes selectable in the app. */
export const COUNTRIES: CountryOption[] = [
  { code: 'us', name: 'United States', flag: '🇺🇸' },
  { code: 'gb', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'ng', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'ca', name: 'Canada', flag: '🇨🇦' },
  { code: 'de', name: 'Germany', flag: '🇩🇪' },
  { code: 'fr', name: 'France', flag: '🇫🇷' },
  { code: 'au', name: 'Australia', flag: '🇦🇺' },
  { code: 'in', name: 'India', flag: '🇮🇳' },
  { code: 'jp', name: 'Japan', flag: '🇯🇵' },
  { code: 'ae', name: 'UAE', flag: '🇦🇪' },
  { code: 'za', name: 'South Africa', flag: '🇿🇦' },
  { code: 'ke', name: 'Kenya', flag: '🇰🇪' },
  { code: 'br', name: 'Brazil', flag: '🇧🇷' },
  { code: 'mx', name: 'Mexico', flag: '🇲🇽' },
];

export const MAX_COUNTRIES = 3;

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code.toUpperCase();
}