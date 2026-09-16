import { matchListings } from '../src/services/matching';

const product = {
  name: 'Nike Air Force 1',
  brand: 'Nike',
  source: 'text',
  searchQuery: 'Nike Air Force 1 White',
};

const base = {
  currency: 'USD',
  shippingCost: 0,
  totalCost: 100,
  productUrl: 'https://example.com',
  inStock: true,
};

describe('matchListings (local fallback)', () => {
  it('scores an identical title at 0.9+ and keeps it', async () => {
    const matched = await matchListings(product as never, [
      { ...base, storeName: 'Store', title: 'Nike Air Force 1 White', price: 100 },
    ] as never);
    expect(matched).toHaveLength(1);
    expect(matched[0].matchConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it('filters out clearly different products below 0.7', async () => {
    const matched = await matchListings(product as never, [
      { ...base, storeName: 'Other', title: 'Random Red Dress Size M', price: 50 },
      { ...base, storeName: 'Good', title: 'Nike Air Force 1 White', price: 90 },
    ] as never);
    expect(matched).toHaveLength(1);
    expect(matched[0].storeName).toBe('Good');
  });

  it('sorts matched results by confidence desc', async () => {
    const matched = await matchListings(product as never, [
      { ...base, storeName: 'Slight', title: 'Nike Air Force White Low', price: 95 },
      { ...base, storeName: 'Exact', title: 'Nike Air Force 1 White', price: 100 },
    ] as never);
    expect(matched[0].storeName).toBe('Exact');
    expect(matched[0].matchConfidence).toBeGreaterThanOrEqual(matched[1].matchConfidence);
    expect(matched[1].matchConfidence).toBeGreaterThanOrEqual(0.7);
  });
});