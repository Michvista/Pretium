describe('fetchPrices', () => {
  let fetchPrices: typeof import('../src/services/serpapi').fetchPrices;

  const product = {
    name: 'Nike Air Force 1',
    brand: 'Nike',
    source: 'text',
    searchQuery: 'Nike Air Force 1',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SERPAPI_KEY = 'test-key';
    fetchPrices = require('../src/services/serpapi').fetchPrices;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns [] when the API key is missing', async () => {
    delete process.env.EXPO_PUBLIC_SERPAPI_KEY;
    fetchPrices = require('../src/services/serpapi').fetchPrices;
    const results = await fetchPrices(product as never);
    expect(results).toEqual([]);
  });

  it('maps, sorts and returns results cheapest-first', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            shopping_results: [
              {
                title: 'Nike AF1',
                source: 'Expensive Store',
                price: '$130.00',
                link: 'https://a.com/x',
                delivery: '$5.00 delivery',
                rating: 4.9,
                reviews: 1200,
              },
              {
                title: 'Nike AF1',
                source: 'Cheap Store',
                price: '$100.00',
                link: 'https://b.com/x',
                delivery: 'Free delivery',
                rating: 3.2,
              },
              {
                title: 'No URL',
                source: 'Broken Store',
                price: '$50.00',
              },
            ],
          }),
      })
    ) as jest.Mock;

    const results = await fetchPrices(product as never);
    expect(results).toHaveLength(2);
    expect(results[0].storeName).toBe('Cheap Store');
    expect(results[0].totalCost).toBe(100);
    expect(results[0].shippingCost).toBe(0);
    expect(results[1].storeName).toBe('Expensive Store');
    expect(results[1].totalCost).toBe(135);
    expect(results[1].rating).toBe(4.9);
  });

  it('handles non-ok responses gracefully', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 429 })) as jest.Mock;
    const results = await fetchPrices(product as never);
    expect(results).toEqual([]);
  });

  it('handles SerpApi error payloads', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ error: 'Invalid API key' }) })
    ) as jest.Mock;
    const results = await fetchPrices(product as never);
    expect(results).toEqual([]);
  });

  it('falls back to empty array when fetch throws', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down'))) as jest.Mock;
    const results = await fetchPrices(product as never);
    expect(results).toEqual([]);
  });
});