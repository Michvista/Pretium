import { create } from 'zustand';

import type { Product } from '@/types';

/** Free tier allows 5 price searches per day. */
export const FREE_DAILY_SEARCH_LIMIT = 5;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

interface AppState {
  recentSearches: Product[];
  addRecentSearch: (product: Product) => void;
  clearRecentSearches: () => void;

  /** Google Shopping countries to search (gl codes). Default from env. */
  selectedCountries: string[];
  setSelectedCountries: (codes: string[]) => void;

  /** RevenueCat "premium" entitlement. */
  isPremium: boolean;
  setPremium: (value: boolean) => void;

  /** Daily search counter (free tier limit). */
  searchCount: number;
  searchDate: string;
  resetDailySearch: () => void;

  /**
   * Returns true when a price search is allowed, incrementing the counter.
   * Premium users are unlimited; free users get FREE_DAILY_SEARCH_LIMIT.
   */
  checkAndIncrementSearch: () => boolean;
}

const DEFAULT_COUNTRIES = (process.env.EXPO_PUBLIC_SERPAPI_COUNTRIES ?? 'us')
  .split(',')
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean)
  .slice(0, 3);

export const useAppStore = create<AppState>()((set, get) => ({
  recentSearches: [],
  addRecentSearch: (product) =>
    set((state) => ({
      recentSearches: [
        product,
        ...state.recentSearches.filter((p) => p.name !== product.name),
      ].slice(0, 10),
    })),
  clearRecentSearches: () => set({ recentSearches: [] }),

  selectedCountries: DEFAULT_COUNTRIES,
  setSelectedCountries: (codes) => set({ selectedCountries: codes.slice(0, 3) }),

  isPremium: false,
  setPremium: (value) => set({ isPremium: value }),

  searchCount: 0,
  searchDate: todayKey(),
  resetDailySearch: () => set({ searchCount: 0, searchDate: todayKey() }),

  checkAndIncrementSearch: () => {
    const state = get();
    if (state.searchDate !== todayKey()) {
      set({ searchCount: 0, searchDate: todayKey() });
    }
    const count = get().searchCount;
    if (state.isPremium || count < FREE_DAILY_SEARCH_LIMIT) {
      set({ searchCount: count + 1 });
      return true;
    }
    return false;
  },
}));