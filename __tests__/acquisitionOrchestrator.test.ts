import {
  deduplicateListingsByUrl,
  extractDirectUrlCandidate,
  normalizeListingUrl,
  orchestrateRetrieval,
} from '../src/services/acquisitionOrchestrator';
import type { PriceResult, Product } from '../src/types';

describe('acquisitionOrchestrator service', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SERPAPI_KEY = 'test-serpapi-key';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SERPAPI_KEY;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('normalizeListingUrl & deduplicateListingsByUrl', () => {
    it('strips tracking query parameters and trailing slashes from URLs', () => {
      const dirtyUrl1 =
        'https://www.amazon.com/Sony-Headphones/dp/B09XS7JWHH/?utm_source=google&utm_medium=cpc&ref=xyz';
      const dirtyUrl2 =
        'https://www.amazon.com/Sony-Headphones/dp/B09XS7JWHH?tag=affiliate-20';

      expect(normalizeListingUrl(dirtyUrl1)).toBe(
        'https://www.amazon.com/Sony-Headphones/dp/B09XS7JWHH'
      );
      expect(normalizeListingUrl(dirtyUrl2)).toBe(
        'https://www.amazon.com/Sony-Headphones/dp/B09XS7JWHH'
      );
    });

    it('deduplicates identical listing URLs across different sources', () => {
      const listings: PriceResult[] = [
        {
          storeName: 'Amazon',
          productUrl: 'https://www.amazon.com/item/123?utm_source=ad',
          price: 399,
          currency: 'USD',
          shippingCost: null,
          totalCost: 399,
          inStock: true,
          retrievalSource: 'serpapi',
        },
        {
          storeName: 'Amazon',
          productUrl: 'https://www.amazon.com/item/123/?ref=tracker',
          price: 399,
          currency: 'USD',
          shippingCost: null,
          totalCost: 399,
          inStock: true,
          retrievalSource: 'scraper',
        },
        {
          storeName: 'Best Buy',
          productUrl: 'https://www.bestbuy.com/item/456',
          price: 420,
          currency: 'USD',
          shippingCost: null,
          totalCost: 420,
          inStock: true,
          retrievalSource: 'serpapi',
        },
      ];

      const deduplicated = deduplicateListingsByUrl(listings);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].storeName).toBe('Amazon');
      expect(deduplicated[0].retrievalSource).toBe('serpapi');
      expect(deduplicated[1].storeName).toBe('Best Buy');
    });
  });

  describe('extractDirectUrlCandidate', () => {
    it('creates a candidate listing with direct_url provenance when product was captured via link', () => {
      const linkProduct: Product = {
        name: 'Apple iPhone 15 Pro',
        brand: 'Apple Store',
        price: 999,
        currency: 'USD',
        imageUrl: 'https://apple.com/iphone.jpg',
        source: 'link',
        sourceUrl: 'https://www.apple.com/shop/buy-iphone/iphone-15-pro',
        searchQuery: 'Apple iPhone 15 Pro',
      };

      const candidate = extractDirectUrlCandidate(linkProduct);
      expect(candidate).not.toBeNull();
      expect(candidate).toEqual({
        storeName: 'Apple Store',
        productUrl: 'https://www.apple.com/shop/buy-iphone/iphone-15-pro',
        rawTitle: 'Apple iPhone 15 Pro',
        title: 'Apple iPhone 15 Pro',
        listingImageUrl: 'https://apple.com/iphone.jpg',
        imageUrl: 'https://apple.com/iphone.jpg',
        price: 999,
        currency: 'USD',
        shippingCost: null,
        totalCost: 999,
        inStock: true,
        retrievalSource: 'direct_url',
      });
    });

    it('returns null if product was not captured via link or has no valid price', () => {
      const textProduct: Product = {
        name: 'Sony WH-1000XM5',
        source: 'text',
        searchQuery: 'Sony WH-1000XM5',
      };
      expect(extractDirectUrlCandidate(textProduct)).toBeNull();

      const linkWithoutPrice: Product = {
        name: 'Nike Air Force 1',
        source: 'link',
        sourceUrl: 'https://nike.com/af1',
        searchQuery: 'Nike Air Force 1',
      };
      expect(extractDirectUrlCandidate(linkWithoutPrice)).toBeNull();
    });
  });

  describe('orchestrateRetrieval channel execution', () => {
    const searchProduct: Product = {
      name: 'Sony WH-1000XM5',
      brand: 'Sony',
      model: 'WH-1000XM5',
      source: 'text',
      searchQuery: 'Sony WH-1000XM5',
    };

    it('retrieves SerpApi candidates and assigns retrievalSource: serpapi', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                shopping_results: [
                  {
                    title: 'Sony WH-1000XM5',
                    source: 'Amazon',
                    price: '$398.00',
                    link: 'https://amazon.com/item/1',
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(searchProduct, { bypassCache: true });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Amazon');
      expect(results[0].price).toBe(398);
      expect(results[0].retrievalSource).toBe('serpapi');
    });

    it('activates fallback scraper when SerpApi returns zero results', async () => {
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
              <a href="/jumia-item.html">
                <div class="name">Sony WH-1000XM5 Jumia</div>
                <div class="prc">₦ 580,000</div>
              </a>
            </article>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }
        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(searchProduct, { bypassCache: true });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Jumia');
      expect(results[0].price).toBe(580000);
      expect(results[0].currency).toBe('NGN');
      expect(results[0].retrievalSource).toBe('scraper');
    });

    it('aggregates direct URL and search candidates while removing duplicates', async () => {
      const linkProduct: Product = {
        name: 'Sony WH-1000XM5',
        brand: 'Sony Store',
        price: 399.99,
        currency: 'USD',
        source: 'link',
        sourceUrl: 'https://store.sony.com/product/wh1000xm5',
        searchQuery: 'Sony WH-1000XM5',
      };

      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                shopping_results: [
                  {
                    title: 'Sony WH-1000XM5 - Official Store',
                    source: 'Sony Store',
                    price: '$399.99',
                    // Duplicate URL with tracking params
                    link: 'https://store.sony.com/product/wh1000xm5?utm_source=google',
                  },
                  {
                    title: 'Sony WH-1000XM5 - Best Buy',
                    source: 'Best Buy',
                    price: '$389.00',
                    link: 'https://bestbuy.com/sony-headphones',
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(linkProduct, { bypassCache: true });
      // Direct URL candidate (Sony Store) + Best Buy. The duplicate SerpApi Sony Store link is deduplicated.
      expect(results).toHaveLength(2);

      const sources = results.map((r) => r.retrievalSource);
      expect(sources).toContain('direct_url');
      expect(sources).toContain('serpapi');

      // Best Buy ($389) is sorted before Sony Store ($399.99)
      expect(results[0].price).toBe(389);
      expect(results[0].storeName).toBe('Best Buy');
    });

    it('preserves successful results when one source encounters a network failure', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.reject(new Error('SerpApi connection reset'));
        }
        if (url.includes('jumia.com.ng')) {
          const html = `
            <article class="prd">
              <a href="/jumia-item.html">
                <div class="name">Sony WH-1000XM5 Jumia</div>
                <div class="prc">₦ 580,000</div>
              </a>
            </article>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }
        return Promise.resolve({ ok: false, status: 500 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(searchProduct, { bypassCache: true });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Jumia');
      expect(results[0].retrievalSource).toBe('scraper');
    });

    it('returns empty array cleanly when all sources fail or return zero hits', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shopping_results: [] }),
          text: () => Promise.resolve(''),
        })
      ) as jest.Mock;

      const results = await orchestrateRetrieval(searchProduct, { bypassCache: true });
      expect(results).toEqual([]);
    });

    it('respects timeout budget and resolves cleanly without crashing', async () => {
      // Mock hanging network call
      global.fetch = jest.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(searchProduct, {
        bypassCache: true,
        timeoutMs: 50,
      });
      expect(results).toEqual([]);
    });

    it('preserves Phase 2 retrieval-only rule: no similarity scoring or candidate filtering', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                shopping_results: [
                  {
                    title: 'Sony WH-1000XM5 Ear Pads Replacement',
                    source: 'PartsStore',
                    price: '$19.99',
                    link: 'https://parts.com/item1',
                  },
                  {
                    title: 'Sony WH-1000XM4 Previous Gen Headphones',
                    source: 'OldStock',
                    price: '$249.00',
                    link: 'https://oldstock.com/item2',
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(searchProduct, { bypassCache: true });
      // Both accessory and older model are strictly preserved in Phase 2
      expect(results).toHaveLength(2);
      expect(results[0].rawTitle).toContain('Ear Pads');
      expect(results[1].rawTitle).toContain('WH-1000XM4');
      expect(results[0].matchConfidence).toBeUndefined();
      expect(results[1].matchConfidence).toBeUndefined();
    });
  });
});
