import {
  deduplicateListingsByUrl,
  extractDirectUrlCandidate,
  normalizeListingUrl,
  orchestrateRetrieval,
} from '../src/services/acquisitionOrchestrator';
import {
  extractAsinFromUrl,
  extractProductFromHtml,
  extractProductFromLink,
  parseJsonLdProduct,
  parseMicrodataProduct,
} from '../src/services/linkExtractor';
import { synthesizeQueries } from '../src/services/querySynthesis';
import {
  detectCurrency,
  parseAmazonHtml,
  parseBestBuyApiResponse,
  parseJumiaHtml,
  parsePriceString,
  scrapePrices,
  withTimeout,
} from '../src/services/scraper';
import { fetchPrices, querySerpApiShopping } from '../src/services/serpapi';
import type { PriceResult, Product } from '../src/types';

describe('Phase 2 — Data Acquisition Layer Validation', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SERPAPI_KEY = 'test-serpapi-key';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SERPAPI_KEY;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. SerpApi Retrieval Tests
  // =========================================================================
  describe('1. SerpApi Retrieval', () => {
    it('successfully acquires and maps shopping results', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              shopping_results: [
                {
                  title: 'Nike Air Force 1 07',
                  source: 'Nike Store',
                  price: '$115.00',
                  link: 'https://nike.com/af1',
                  delivery: 'Free shipping',
                  thumbnail: 'https://nike.com/af1.jpg',
                  rating: 4.8,
                  reviews: 1250,
                },
              ],
            }),
        })
      ) as jest.Mock;

      const results = await querySerpApiShopping('Nike Air Force 1', 'us', 'en');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        storeName: 'Nike Store',
        rawTitle: 'Nike Air Force 1 07',
        title: 'Nike Air Force 1 07',
        price: 115,
        currency: 'USD',
        shippingCost: 0,
        totalCost: 115,
        productUrl: 'https://nike.com/af1',
        inStock: true,
        listingImageUrl: 'https://nike.com/af1.jpg',
        imageUrl: 'https://nike.com/af1.jpg',
        rating: 4.8,
        ratingCount: 1250,
      });
    });

    it('handles empty result sets cleanly', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shopping_results: [] }),
        })
      ) as jest.Mock;

      const results = await querySerpApiShopping('NonExistentProductXYZ123', 'us', 'en');
      expect(results).toEqual([]);
    });

    it('handles API failure responses gracefully without throwing', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, status: 500 })
      ) as jest.Mock;

      const results = await querySerpApiShopping('iPhone 15 Pro', 'us', 'en');
      expect(results).toEqual([]);
    });

    it('handles rate-limit (HTTP 429) and SerpApi error payloads', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, status: 429 })
      ) as jest.Mock;

      const rateLimitResults = await querySerpApiShopping('MacBook', 'us', 'en');
      expect(rateLimitResults).toEqual([]);

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ error: 'Your account has run out of searches.' }),
        })
      ) as jest.Mock;

      const errorResults = await querySerpApiShopping('MacBook', 'us', 'en');
      expect(errorResults).toEqual([]);
    });

    it('discards malformed result entries missing price or product link', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              shopping_results: [
                { title: 'Valid Listing', source: 'Store', price: '$50.00', link: 'https://store.com/1' },
                { title: 'Missing Price', source: 'Store', link: 'https://store.com/2' },
                { title: 'Missing Link', source: 'Store', price: '$30.00' },
                { title: 'Zero Price', source: 'Store', price: '$0.00', link: 'https://store.com/3' },
              ],
            }),
        })
      ) as jest.Mock;

      const results = await querySerpApiShopping('Product', 'us', 'en');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Valid Listing');
    });

    it('integrates query synthesis and sends strict localized parameters', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shopping_results: [] }),
        })
      ) as jest.Mock;

      const product: Product = {
        name: 'Apple iPhone 15 Pro (128 GB)',
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        color: 'Natural Titanium',
        source: 'text',
        searchQuery: 'Apple iPhone 15 Pro 128GB Natural Titanium',
      };

      await fetchPrices(product, { gl: 'gb', hl: 'en' });
      expect(global.fetch).toHaveBeenCalled();
      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('gl=gb');
      expect(calledUrl).toContain('hl=en');
      expect(calledUrl).toContain('direct_link=true');
    });
  });

  // =========================================================================
  // 2. Scraper Fallback Acquisition Tests
  // =========================================================================
  describe('2. Scraper Fallback Acquisition', () => {
    it('successfully acquires candidate listings from Jumia HTML', () => {
      const html = `
        <article class="prd">
          <a class="core" href="/samsung-galaxy-s24-ultra.html">
            <h3 class="name">Samsung Galaxy S24 Ultra 512GB Titanium Gray</h3>
            <div class="prc">₦ 1,850,000</div>
            <img class="img" data-src="https://ng.jumia.is/s24.jpg" />
            <div class="stars _s">4.9 out of 5</div>
            <div class="rev">(88)</div>
          </a>
        </article>
      `;

      const results = parseJumiaHtml(html);
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Jumia');
      expect(results[0].price).toBe(1850000);
      expect(results[0].currency).toBe('NGN');
      expect(results[0].productUrl).toBe('https://www.jumia.com.ng/samsung-galaxy-s24-ultra.html');
      expect(results[0].listingImageUrl).toBe('https://ng.jumia.is/s24.jpg');
      expect(results[0].rating).toBe(4.9);
      expect(results[0].ratingCount).toBe(88);
    });

    it('successfully acquires candidate listings from Amazon HTML', () => {
      const html = `
        <div data-component-type="s-search-result">
          <h2>
            <a href="/Samsung-Galaxy-S24-Ultra-Unlocked/dp/B0CQ227G55">
              <span>Samsung Galaxy S24 Ultra 512GB Smartphone</span>
            </a>
          </h2>
          <span class="a-offscreen">$1,199.99</span>
          <img class="s-image" src="https://m.media-amazon.com/s24.jpg" />
          <span class="a-icon-alt">4.6 out of 5 stars</span>
          <span class="a-size-base s-underline-text">1,432</span>
        </div>
      `;

      const results = parseAmazonHtml(html);
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Amazon');
      expect(results[0].price).toBe(1199.99);
      expect(results[0].currency).toBe('USD');
      expect(results[0].productUrl).toContain('B0CQ227G55');
      expect(results[0].rating).toBe(4.6);
      expect(results[0].ratingCount).toBe(1432);
    });

    it('successfully acquires candidate listings from Best Buy API payload', () => {
      const payload = {
        products: [
          {
            name: 'Samsung - Galaxy S24 Ultra 512GB - Titanium Black',
            salePrice: 1199.99,
            regularPrice: 1419.99,
            url: 'https://bestbuy.com/s24-ultra',
            image: 'https://pisces.bbystatic.com/s24.jpg',
            customerReviewAverage: 4.7,
            customerReviewCount: 950,
            inStoreAvailability: true,
          },
        ],
      };

      const results = parseBestBuyApiResponse(payload);
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Best Buy');
      expect(results[0].price).toBe(1199.99);
      expect(results[0].currency).toBe('USD');
      expect(results[0].inStock).toBe(true);
    });

    it('handles empty fallback cleanly', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, text: () => Promise.resolve('<div class="empty"></div>') })
      ) as jest.Mock;

      const product: Product = {
        name: 'Obscure Item 999',
        source: 'text',
        searchQuery: 'Obscure Item 999',
      };

      const results = await scrapePrices(product, { timeoutMs: 1000, stores: ['jumia', 'amazon'] });
      expect(results).toEqual([]);
    });

    it('handles individual retailer failure without failing other retailers', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('jumia.com.ng')) {
          return Promise.reject(new Error('Jumia connection refused'));
        }
        if (url.includes('amazon.com')) {
          const html = `
            <div data-component-type="s-search-result">
              <h2><a href="/dp/B001"><span>Sony WH-1000XM5</span></a></h2>
              <span class="a-offscreen">$399.00</span>
            </div>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }
        return Promise.resolve({ ok: false, status: 500 });
      }) as jest.Mock;

      const product: Product = {
        name: 'Sony WH-1000XM5',
        source: 'text',
        searchQuery: 'Sony WH-1000XM5',
      };

      const results = await scrapePrices(product, { timeoutMs: 1000, stores: ['jumia', 'amazon'] });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Amazon');
    });

    it('enforces timeout with withTimeout helper without throwing', async () => {
      const slowFn = (signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          const t = setTimeout(() => resolve('finished'), 500);
          signal.addEventListener('abort', () => clearTimeout(t));
        });

      const result = await withTimeout(slowFn, 50, 'timed-out');
      expect(result).toBe('timed-out');
    });

    it('safely discards malformed scraped items missing price', () => {
      const malformedJumia = `
        <article class="prd">
          <a class="core" href="/item">
            <h3 class="name">Item Without Price</h3>
          </a>
        </article>
      `;
      expect(parseJumiaHtml(malformedJumia)).toEqual([]);
    });
  });

  // =========================================================================
  // 3. Direct URL Acquisition Tests
  // =========================================================================
  describe('3. Direct URL Acquisition', () => {
    it('extracts rich product metadata and Schema.org JSON-LD', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Apple MacBook Pro 16-inch M3 Max",
                "brand": "Apple",
                "description": "High performance professional laptop",
                "image": "https://example.com/macbook.jpg",
                "sku": "MUW63LL/A",
                "mpn": "MUW63LL/A",
                "gtin13": "0195949012345",
                "offers": {
                  "@type": "Offer",
                  "price": "3499.00",
                  "priceCurrency": "USD",
                  "availability": "https://schema.org/InStock"
                }
              }
            </script>
          </head>
        </html>
      `;

      const product = extractProductFromHtml(html, 'https://example.com/macbook');
      expect(product.name).toBe('Apple MacBook Pro 16-inch M3 Max');
      expect(product.brand).toBe('Apple');
      expect(product.price).toBe(3499);
      expect(product.currency).toBe('USD');
      expect(product.identifiers?.sku).toBe('MUW63LL/A');
      expect(product.identifiers?.mpn).toBe('MUW63LL/A');
      expect(product.identifiers?.gtin).toBe('0195949012345');
      expect(product.availability).toBe('InStock');
      expect(product.specifications?.availability).toBe('InStock');
    });

    it('extracts HTML microdata when JSON-LD is absent', () => {
      const html = `
        <div itemscope itemtype="https://schema.org/Product">
          <h1 itemprop="name">Nike Dunk Low Retro</h1>
          <span itemprop="brand">Nike</span>
          <span itemprop="price" content="115.00">$115.00</span>
          <meta itemprop="priceCurrency" content="USD" />
          <link itemprop="availability" href="https://schema.org/InStock" />
          <span itemprop="sku">DD1391-100</span>
        </div>
      `;

      const data = parseMicrodataProduct(html);
      expect(data?.name).toBe('Nike Dunk Low Retro');
      expect(data?.brand).toBe('Nike');
      expect(data?.price).toBe(115);
      expect(data?.currency).toBe('USD');
      expect(data?.sku).toBe('DD1391-100');
      expect(data?.availability).toBe('InStock');
    });

    it('extracts OpenGraph metadata when structured schemas are absent', async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Sony PlayStation 5 Console">
            <meta property="og:site_name" content="PlayStation Store">
            <meta property="og:image" content="https://playstation.com/ps5.jpg">
            <meta property="og:price:amount" content="499.99">
            <meta property="og:price:currency" content="USD">
          </head>
        </html>
      `;

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://store.playstation.com/ps5',
          text: () => Promise.resolve(html),
        })
      ) as jest.Mock;

      const product = await extractProductFromLink('https://store.playstation.com/ps5');
      expect(product.name).toBe('Sony PlayStation 5 Console');
      expect(product.brand).toBe('PlayStation Store');
      expect(product.price).toBe(499.99);
      expect(product.currency).toBe('USD');
    });

    it('handles Amazon product links by extracting ASIN from URL format', () => {
      expect(
        extractAsinFromUrl('https://www.amazon.com/Sony-WH-1000XM5/dp/B09XS7JWHH?ref=sr_1_1')
      ).toBe('B09XS7JWHH');

      const product = extractProductFromHtml(
        '<html><head><title>Sony WH-1000XM5</title></head></html>',
        'https://www.amazon.com/Sony-WH-1000XM5/dp/B09XS7JWHH'
      );
      expect(product.identifiers?.asin).toBe('B09XS7JWHH');
    });

    it('handles missing prices gracefully', () => {
      const html = `
        <html>
          <head>
            <title>Unpriced Announcement Product</title>
            <meta property="og:title" content="Unpriced Announcement Product">
          </head>
        </html>
      `;

      const product = extractProductFromHtml(html, 'https://example.com/unpriced');
      expect(product.name).toBe('Unpriced Announcement Product');
      expect(product.price).toBeNull();
    });

    it('surfaces descriptive error on HTTP 403 Forbidden', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, status: 403, url: 'https://example.com/blocked' })
      ) as jest.Mock;

      await expect(extractProductFromLink('https://example.com/blocked')).rejects.toThrow(
        'HTTP 403 Forbidden'
      );
    });

    it('safely parses malformed HTML without crashing', () => {
      const corruptHtml = '<<>>><script type="application/ld+json">{ broken </script><title>Valid Title</title>';
      const product = extractProductFromHtml(corruptHtml, 'https://example.com/corrupt');
      expect(product.name).toBe('Valid Title');
    });
  });

  // =========================================================================
  // 4. Multi-Source Orchestration Tests
  // =========================================================================
  describe('4. Multi-Source Orchestration', () => {
    const laptopProduct: Product = {
      name: 'MacBook Pro 16 M3 Max',
      brand: 'Apple',
      model: 'M3 Max',
      source: 'text',
      searchQuery: 'Apple MacBook Pro 16 M3 Max',
    };

    it('executes primary SerpApi search and assigns retrievalSource: serpapi', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                shopping_results: [
                  {
                    title: 'Apple MacBook Pro 16 M3 Max',
                    source: 'B&H Photo',
                    price: '$3,499.00',
                    link: 'https://bhphotovideo.com/item/1',
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(laptopProduct, { bypassCache: true });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('B&H Photo');
      expect(results[0].price).toBe(3499);
      expect(results[0].retrievalSource).toBe('serpapi');
    });

    it('activates fallback scraper when SerpApi returns zero candidates', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ shopping_results: [] }),
          });
        }
        if (url.includes('amazon.com')) {
          const html = `
            <div data-component-type="s-search-result">
              <h2><a href="/dp/B0CM59X7G3"><span>Apple MacBook Pro 16 M3 Max Amazon</span></a></h2>
              <span class="a-offscreen">$3,499.00</span>
            </div>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }
        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(laptopProduct, { bypassCache: true });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Amazon');
      expect(results[0].retrievalSource).toBe('scraper');
    });

    it('aggregates direct URL candidate with SerpApi search candidates', async () => {
      const linkCapturedProduct: Product = {
        name: 'MacBook Pro 16 M3 Max',
        brand: 'Apple Store',
        price: 3499,
        currency: 'USD',
        source: 'link',
        sourceUrl: 'https://apple.com/macbook-pro',
        searchQuery: 'Apple MacBook Pro 16 M3 Max',
      };

      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                shopping_results: [
                  {
                    title: 'MacBook Pro 16 M3 Max - Best Buy',
                    source: 'Best Buy',
                    price: '$3,399.00',
                    link: 'https://bestbuy.com/macbook',
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(linkCapturedProduct, { bypassCache: true });
      expect(results).toHaveLength(2);

      const sources = results.map((r) => r.retrievalSource);
      expect(sources).toContain('direct_url');
      expect(sources).toContain('serpapi');

      // Best Buy ($3,399) sorted before Apple Store ($3,499)
      expect(results[0].storeName).toBe('Best Buy');
      expect(results[0].price).toBe(3399);
      expect(results[1].storeName).toBe('Apple Store');
      expect(results[1].price).toBe(3499);
    });

    it('deduplicates identical URLs across sources while keeping distinct URLs', () => {
      const candidates: PriceResult[] = [
        {
          storeName: 'Direct',
          productUrl: 'https://example.com/product/123?utm_medium=email',
          price: 100,
          currency: 'USD',
          shippingCost: null,
          totalCost: 100,
          inStock: true,
          retrievalSource: 'direct_url',
        },
        {
          storeName: 'SerpApi Result',
          productUrl: 'https://example.com/product/123?ref=search',
          price: 100,
          currency: 'USD',
          shippingCost: null,
          totalCost: 100,
          inStock: true,
          retrievalSource: 'serpapi',
        },
        {
          storeName: 'Distinct Store',
          productUrl: 'https://otherstore.com/product/123',
          price: 110,
          currency: 'USD',
          shippingCost: null,
          totalCost: 110,
          inStock: true,
          retrievalSource: 'serpapi',
        },
      ];

      const deduped = deduplicateListingsByUrl(candidates);
      expect(deduped).toHaveLength(2);
      expect(deduped[0].retrievalSource).toBe('direct_url');
      expect(deduped[1].storeName).toBe('Distinct Store');
    });

    it('handles partial source failure without destroying successful results', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('serpapi.com')) {
          return Promise.reject(new Error('SerpApi network timed out'));
        }
        if (url.includes('jumia.com.ng')) {
          const html = `
            <article class="prd">
              <a href="/jumia-item.html">
                <div class="name">MacBook Pro Jumia</div>
                <div class="prc">₦ 4,500,000</div>
              </a>
            </article>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }
        return Promise.resolve({ ok: false, status: 500 });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(laptopProduct, { bypassCache: true });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Jumia');
      expect(results[0].retrievalSource).toBe('scraper');
    });

    it('enforces timeout budget without crashing or hanging the app', async () => {
      global.fetch = jest.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('budget timeout');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }) as jest.Mock;

      const results = await orchestrateRetrieval(laptopProduct, {
        bypassCache: true,
        timeoutMs: 50,
      });
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // 5. Phase 1 Listing Contract Compliance
  // =========================================================================
  describe('5. Phase 1 Listing Contract Compliance Across Product Categories', () => {
    const testCases: { category: string; product: Product }[] = [
      {
        category: 'Sneakers',
        product: {
          name: 'Nike Air Force 1 07 White',
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'White',
          source: 'text',
          searchQuery: 'Nike Air Force 1 07 White',
        },
      },
      {
        category: 'Laptops',
        product: {
          name: 'Apple MacBook Pro 14 M3',
          brand: 'Apple',
          model: 'MacBook Pro 14',
          source: 'text',
          searchQuery: 'Apple MacBook Pro 14 M3',
        },
      },
      {
        category: 'Smartphones',
        product: {
          name: 'Samsung Galaxy S24 Ultra',
          brand: 'Samsung',
          model: 'Galaxy S24 Ultra',
          source: 'text',
          searchQuery: 'Samsung Galaxy S24 Ultra',
        },
      },
      {
        category: 'Consumer Electronics',
        product: {
          name: 'Sony WH-1000XM5 Wireless Headphones',
          brand: 'Sony',
          model: 'WH-1000XM5',
          color: 'Black',
          source: 'text',
          searchQuery: 'Sony WH-1000XM5 Black',
        },
      },
    ];

    for (const { category, product } of testCases) {
      it(`verifies candidate listing structure for ${category}`, async () => {
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                shopping_results: [
                  {
                    title: `${product.name} - Retailer Offer`,
                    source: 'Test Retailer',
                    price: '$299.99',
                    link: 'https://retailer.com/item/1',
                    thumbnail: 'https://retailer.com/img.jpg',
                    delivery: '$10.00',
                    rating: 4.5,
                    reviews: 320,
                  },
                ],
              }),
          })
        ) as jest.Mock;

        const results = await orchestrateRetrieval(product, { bypassCache: true });
        expect(results).toHaveLength(1);
        const listing = results[0];

        // Required Phase 1 RetailerListing fields
        expect(typeof listing.storeName).toBe('string');
        expect(listing.storeName.length).toBeGreaterThan(0);
        expect(typeof listing.productUrl).toBe('string');
        expect(listing.productUrl.startsWith('http')).toBe(true);
        expect(typeof listing.price).toBe('number');
        expect(listing.price).toBeGreaterThan(0);
        expect(typeof listing.currency).toBe('string');
        expect(listing.currency.length).toBe(3);
        expect(typeof listing.totalCost).toBe('number');
        expect(listing.totalCost).toBeGreaterThanOrEqual(listing.price);
        expect(typeof listing.inStock).toBe('boolean');
        expect(typeof listing.rawTitle).toBe('string');

        // Optional Phase 1 fields
        expect(typeof listing.listingImageUrl).toBe('string');
        expect(typeof listing.rating).toBe('number');
        expect(typeof listing.ratingCount).toBe('number');
        expect(listing.shippingCost).toBe(10);

        // Provenance
        expect(listing.retrievalSource).toBe('serpapi');

        // Phase 1 / Phase 2 boundary check: matchConfidence must not be set
        expect(listing.matchConfidence).toBeUndefined();
      });
    }
  });

  // =========================================================================
  // 6. Phase 2 Boundary Verification (Acquisition-Only Guarantee)
  // =========================================================================
  describe('6. Phase 2 Boundary Verification (No Matching or Filtering)', () => {
    it('preserves accessories, parts, and different models without filtering them', async () => {
      const targetPhone: Product = {
        name: 'Samsung Galaxy S24 Ultra',
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        source: 'text',
        searchQuery: 'Samsung Galaxy S24 Ultra',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              shopping_results: [
                {
                  title: 'Galaxy S24 Ultra Silicone Case', // Accessory
                  source: 'CaseStore',
                  price: '$29.99',
                  link: 'https://casestore.com/case',
                },
                {
                  title: 'Samsung Galaxy S23 Ultra (Previous Gen)', // Older model
                  source: 'RefurbStore',
                  price: '$699.00',
                  link: 'https://refurbstore.com/s23',
                },
                {
                  title: 'Samsung Galaxy S24 Ultra 512GB', // Exact target
                  source: 'OfficialStore',
                  price: '$1,199.99',
                  link: 'https://samsung.com/s24',
                },
              ],
            }),
        })
      ) as jest.Mock;

      const results = await orchestrateRetrieval(targetPhone, { bypassCache: true });

      // In Phase 2, all 3 candidates MUST be preserved.
      // Phase 2 acquires candidates; it does not decide whether they are correct.
      expect(results).toHaveLength(3);
      const titles = results.map((r) => r.rawTitle);
      expect(titles.some((t) => t?.includes('Silicone Case'))).toBe(true);
      expect(titles.some((t) => t?.includes('Galaxy S23 Ultra'))).toBe(true);
      expect(titles.some((t) => t?.includes('512GB'))).toBe(true);

      // Verify no similarity scoring or match confidence has been calculated
      for (const item of results) {
        expect(item.matchConfidence).toBeUndefined();
      }
    });
  });
});
