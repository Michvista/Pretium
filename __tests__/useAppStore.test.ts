import { useAppStore } from '../src/store/useAppStore';

const fresh = () => useAppStore.setState({ searchCount: 0, isPremium: false });

describe('useAppStore search limit', () => {
  beforeEach(fresh);

  it('allows the first 5 free searches', () => {
    for (let i = 0; i < 5; i++) {
      expect(useAppStore.getState().checkAndIncrementSearch()).toBe(true);
    }
    expect(useAppStore.getState().searchCount).toBe(5);
  });

  it('blocks the 6th free search and pays no false credit', () => {
    for (let i = 0; i < 5; i++) useAppStore.getState().checkAndIncrementSearch();
    expect(useAppStore.getState().checkAndIncrementSearch()).toBe(false);
    expect(useAppStore.getState().searchCount).toBe(5);
  });

  it('gives premium users unlimited searches', () => {
    useAppStore.getState().setPremium(true);
    for (let i = 0; i < 20; i++) {
      expect(useAppStore.getState().checkAndIncrementSearch()).toBe(true);
    }
  });

  it('resets the daily counter when the date changes', () => {
    for (let i = 0; i < 5; i++) useAppStore.getState().checkAndIncrementSearch();
    useAppStore.setState({ searchDate: '2000-01-01' });
    expect(useAppStore.getState().checkAndIncrementSearch()).toBe(true);
    expect(useAppStore.getState().searchCount).toBe(1);
  });
});

describe('useAppStore recent searches', () => {
  beforeEach(() => useAppStore.setState({ recentSearches: [] }));

  it('adds and dedupes recent searches', () => {
    const s = useAppStore.getState();
    s.addRecentSearch({ name: 'A', source: 'text', searchQuery: 'A' });
    s.addRecentSearch({ name: 'B', source: 'text', searchQuery: 'B' });
    s.addRecentSearch({ name: 'A', source: 'text', searchQuery: 'A' });
    const names = useAppStore.getState().recentSearches.map((p) => p.name);
    expect(names).toEqual(['A', 'B']);
  });
});