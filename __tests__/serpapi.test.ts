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

  it('passes localization options and direct_link to SerpApi URL', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shopping_results: [] }),
      })
    ) as jest.Mock;

    await fetchPrices(product as never, { gl: 'gb', hl: 'en' });
    expect(global.fetch).toHaveBeenCalled();
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('gl=gb');
    expect(calledUrl).toContain('hl=en');
    expect(calledUrl).toContain('direct_link=true');
  });

  it('attempts broadQuery fallback when strict query returns zero results', async () => {
    const multiAttributeProduct = {
      name: 'Sony WH-1000XM5',
      brand: 'Sony',
      model: 'WH-1000XM5',
      color: 'Black',
      source: 'image',
      searchQuery: 'Sony WH-1000XM5 Black',
    };

    let callCount = 0;
    global.fetch = jest.fn((url: string) => {
      callCount++;
      if (callCount === 1) {
        // Strict query returns 0 results
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shopping_results: [] }),
        });
      }
      // Broad query returns 1 result
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            shopping_results: [
              {
                title: 'Sony WH-1000XM5 Headphones',
                source: 'Sony Store',
                price: '$399.00',
                link: 'https://sony.com/item',
              },
            ],
          }),
      });
    }) as jest.Mock;

    const results = await fetchPrices(multiAttributeProduct as never);
    expect(callCount).toBe(2);
    expect(results).toHaveLength(1);
    expect(results[0].storeName).toBe('Sony Store');
  });

  it('falls back to retailer scraper when both strict and broad SerpApi queries return zero results', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('serpapi.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shopping_results: [] }),
        });
      }
      if (url.includes('jumia.com.ng')) {
        const html = `
          <article class="prd">
            <a href="/jumia-item-123.html">
              <div class="name">Sony WH-1000XM5 from Jumia</div>
              <div class="prc">₦ 550,000</div>
            </a>
          </article>
        `;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(html),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as jest.Mock;

    const results = await fetchPrices(product as never);
    expect(results).toHaveLength(1);
    expect(results[0].storeName).toBe('Jumia');
    expect(results[0].price).toBe(550000);
  });
});