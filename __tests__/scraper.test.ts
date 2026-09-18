import {
  detectCurrency,
  parseAmazonHtml,
  parseBestBuyApiResponse,
  parseJsonLdListings,
  parseJumiaHtml,
  parsePriceString,
  parseScrapeGraphResponse,
  scrapePrices,
  withTimeout,
} from '../src/services/scraper';
import type { Product } from '../src/types';

describe('scraper service', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('price and currency parsing helpers', () => {
    it('parses formatted price strings correctly', () => {
      expect(parsePriceString('₦ 149,999')).toBe(149999);
      expect(parsePriceString('$199.99')).toBe(199.99);
      expect(parsePriceString('£1,250.50')).toBe(1250.5);
      expect(parsePriceString('1200')).toBe(1200);
      expect(parsePriceString(450.95)).toBe(450.95);
      expect(parsePriceString(null)).toBeNull();
      expect(parsePriceString('')).toBeNull();
    });

    it('detects currency from symbols and ISO codes', () => {
      expect(detectCurrency('₦ 50,000')).toBe('NGN');
      expect(detectCurrency('50,000 NGN')).toBe('NGN');
      expect(detectCurrency('$299.00')).toBe('USD');
      expect(detectCurrency('£89.99')).toBe('GBP');
      expect(detectCurrency('€149.00')).toBe('EUR');
      expect(detectCurrency(null)).toBe('USD');
    });
  });

  describe('parseJsonLdListings', () => {
    it('extracts structured product data from Schema.org JSON-LD', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Sony WH-1000XM5 Noise-Canceling Headphones",
                "image": ["https://example.com/sony.jpg"],
                "offers": {
                  "@type": "Offer",
                  "price": "398.00",
                  "priceCurrency": "USD",
                  "url": "https://example.com/item/123",
                  "availability": "https://schema.org/InStock"
                },
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": "4.6",
                  "reviewCount": "240"
                }
              }
            </script>
          </head>
        </html>
      `;

      const results = parseJsonLdListings(html, 'Test Store');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        storeName: 'Test Store',
        productUrl: 'https://example.com/item/123',
        rawTitle: 'Sony WH-1000XM5 Noise-Canceling Headphones',
        title: 'Sony WH-1000XM5 Noise-Canceling Headphones',
        listingImageUrl: 'https://example.com/sony.jpg',
        imageUrl: 'https://example.com/sony.jpg',
        price: 398,
        currency: 'USD',
        shippingCost: null,
        totalCost: 398,
        inStock: true,
        rating: 4.6,
        ratingCount: 240,
      });
    });

    it('handles malformed JSON-LD scripts gracefully', () => {
      const html = `<script type="application/ld+json">{ invalid json here </script>`;
      expect(parseJsonLdListings(html, 'Test')).toEqual([]);
    });
  });

  describe('parseJumiaHtml', () => {
    it('parses Jumia HTML search catalog cards into RetailerListing candidates', () => {
      const html = `
        <div class="main">
          <article class="prd _fb col c-prd">
            <a class="core" href="/apple-iphone-15-pro-128gb-natural-titanium-123.html">
              <div class="img-c">
                <img class="img" data-src="https://ng.jumia.is/unsafe/fit-in/300x300/filters:fill(white)/product/12/345/1.jpg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="iPhone 15 Pro" />
              </div>
              <div class="info">
                <h3 class="name">Apple iPhone 15 Pro 128GB - Natural Titanium</h3>
                <div class="prc">₦ 1,450,000</div>
                <div class="rev">
                  <div class="stars _s">4.8 out of 5</div>
                  (35)
                </div>
              </div>
            </a>
          </article>
          <article class="prd _fb col c-prd">
            <a class="core" href="/apple-iphone-15-pro-256gb-blue-titanium-456.html">
              <div class="info">
                <h3 class="name">Apple iPhone 15 Pro 256GB - Blue Titanium</h3>
                <div class="prc">₦ 1,650,000</div>
              </div>
            </a>
          </article>
        </div>
      `;

      const results = parseJumiaHtml(html);
      expect(results).toHaveLength(2);

      expect(results[0].storeName).toBe('Jumia');
      expect(results[0].productUrl).toBe(
        'https://www.jumia.com.ng/apple-iphone-15-pro-128gb-natural-titanium-123.html'
      );
      expect(results[0].rawTitle).toBe('Apple iPhone 15 Pro 128GB - Natural Titanium');
      expect(results[0].price).toBe(1450000);
      expect(results[0].currency).toBe('NGN');
      expect(results[0].listingImageUrl).toBe(
        'https://ng.jumia.is/unsafe/fit-in/300x300/filters:fill(white)/product/12/345/1.jpg'
      );
      expect(results[0].rating).toBe(4.8);
      expect(results[0].ratingCount).toBe(35);
      expect(results[0].inStock).toBe(true);

      // Second item without rating or image
      expect(results[1].price).toBe(1650000);
      expect(results[1].rating).toBeNull();
      expect(results[1].ratingCount).toBeNull();
      expect(results[1].listingImageUrl).toBeNull();
    });

    it('returns empty array when no products are found in Jumia HTML', () => {
      const html = '<div class="no-results">No products found</div>';
      expect(parseJumiaHtml(html)).toEqual([]);
    });
  });

  describe('parseAmazonHtml', () => {
    it('extracts listings from Amazon search result cards', () => {
      const html = `
        <div data-component-type="s-search-result">
          <div class="s-card-container">
            <img class="s-image" src="https://m.media-amazon.com/images/I/71xyz.jpg" alt="Sony Headphones" />
            <h2>
              <a class="a-link-normal" href="/Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH">
                <span>Sony WH-1000XM5 Wireless Industry Leading Headphones</span>
              </a>
            </h2>
            <span class="a-price"><span class="a-offscreen">$398.00</span></span>
            <span class="a-icon-alt">4.7 out of 5 stars</span>
            <span class="a-size-base s-underline-text">14,321</span>
          </div>
        </div>
      `;

      const results = parseAmazonHtml(html);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        storeName: 'Amazon',
        productUrl:
          'https://www.amazon.com/Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH',
        rawTitle: 'Sony WH-1000XM5 Wireless Industry Leading Headphones',
        title: 'Sony WH-1000XM5 Wireless Industry Leading Headphones',
        listingImageUrl: 'https://m.media-amazon.com/images/I/71xyz.jpg',
        imageUrl: 'https://m.media-amazon.com/images/I/71xyz.jpg',
        price: 398,
        currency: 'USD',
        shippingCost: null,
        totalCost: 398,
        inStock: true,
        rating: 4.7,
        ratingCount: 14321,
      });
    });

    it('gracefully handles anti-bot challenge (Robot Check / 503) without failing', () => {
      const captchaHtml = `
        <html>
          <head><title>Robot Check</title></head>
          <body>
            <p>To discuss automated access to Amazon data please contact api-services-support@amazon.com.</p>
            <p>Type the characters you see in this image</p>
          </body>
        </html>
      `;

      const results = parseAmazonHtml(captchaHtml);
      expect(results).toEqual([]);
    });
  });

  describe('parseBestBuyApiResponse', () => {
    it('parses Best Buy Open API response into RetailerListing candidates', () => {
      const apiPayload = {
        from: 1,
        to: 1,
        total: 1,
        products: [
          {
            sku: 6505727,
            name: 'Sony - WH-1000XM5 Wireless Noise-Canceling Headphones - Black',
            salePrice: 399.99,
            regularPrice: 399.99,
            url: 'https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p',
            image: 'https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6505/6505727_sd.jpg',
            customerReviewAverage: 4.6,
            customerReviewCount: 2514,
            inStoreAvailability: true,
          },
        ],
      };

      const results = parseBestBuyApiResponse(apiPayload);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        storeName: 'Best Buy',
        productUrl: 'https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p',
        rawTitle: 'Sony - WH-1000XM5 Wireless Noise-Canceling Headphones - Black',
        title: 'Sony - WH-1000XM5 Wireless Noise-Canceling Headphones - Black',
        listingImageUrl:
          'https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6505/6505727_sd.jpg',
        imageUrl:
          'https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6505/6505727_sd.jpg',
        price: 399.99,
        currency: 'USD',
        shippingCost: null,
        totalCost: 399.99,
        inStock: true,
        rating: 4.6,
        ratingCount: 2514,
      });
    });

    it('returns empty array when API returns empty products or null', () => {
      expect(parseBestBuyApiResponse(null)).toEqual([]);
      expect(parseBestBuyApiResponse({ products: [] })).toEqual([]);
    });
  });

  describe('parseScrapeGraphResponse', () => {
    it('parses ScrapeGraphAI payload cleanly', () => {
      const sgResponse = {
        result: [
          {
            name: 'Sony WH-1000XM5',
            price: '$398.00',
            url: 'https://store.sony.com/product/wh1000xm5',
            image_url: 'https://store.sony.com/img.jpg',
            rating: 4.8,
            reviewCount: 95,
          },
        ],
      };

      const results = parseScrapeGraphResponse(sgResponse, 'Sony Store');
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Sony Store');
      expect(results[0].price).toBe(398);
      expect(results[0].currency).toBe('USD');
      expect(results[0].productUrl).toBe('https://store.sony.com/product/wh1000xm5');
    });
  });

  describe('withTimeout resilience guard', () => {
    it('returns the promise result when resolved within timeout limit', async () => {
      const result = await withTimeout(
        async () => 'fast-result',
        1000,
        'fallback'
      );
      expect(result).toBe('fast-result');
    });

    it('returns fallback value and does not throw when operation exceeds timeout', async () => {
      const slowPromise = (signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          const t = setTimeout(() => resolve('too-late'), 500);
          signal.addEventListener('abort', () => clearTimeout(t));
        });

      const result = await withTimeout(slowPromise, 50, 'fallback-timeout');
      expect(result).toBe('fallback-timeout');
    });

    it('catches thrown errors and returns fallback value without crashing', async () => {
      const failingFn = async () => {
        throw new Error('network down');
      };

      const result = await withTimeout(failingFn, 500, 'fallback-error');
      expect(result).toBe('fallback-error');
    });
  });

  describe('scrapePrices integration', () => {
    const product: Product = {
      name: 'Sony WH-1000XM5',
      brand: 'Sony',
      model: 'WH-1000XM5',
      source: 'text',
      searchQuery: 'Sony WH-1000XM5',
    };

    it('aggregates candidates across stores and sorts cheapest-first', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('jumia.com.ng')) {
          const html = `
            <article class="prd">
              <a href="/jumia-sony-123.html">
                <div class="name">Sony WH-1000XM5 Jumia</div>
                <div class="prc">₦ 600,000</div>
              </a>
            </article>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }

        if (url.includes('amazon.com')) {
          const html = `
            <div data-component-type="s-search-result">
              <h2><a href="/dp/B09XS7JWHH"><span>Sony WH-1000XM5 Amazon</span></a></h2>
              <span class="a-offscreen">$399.00</span>
            </div>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }

        return Promise.resolve({ ok: false, status: 404 });
      }) as jest.Mock;

      const results = await scrapePrices(product, { timeoutMs: 1000, stores: ['jumia', 'amazon'] });
      expect(results).toHaveLength(2);
      // Amazon ($399) is cheaper than Jumia (₦600,000)
      expect(results[0].storeName).toBe('Amazon');
      expect(results[0].price).toBe(399);
      expect(results[1].storeName).toBe('Jumia');
      expect(results[1].price).toBe(600000);
    });

    it('handles store failures gracefully and returns partial candidates', async () => {
      global.fetch = jest.fn((url: string) => {
        if (url.includes('jumia.com.ng')) {
          return Promise.reject(new Error('Jumia connection refused'));
        }
        if (url.includes('amazon.com')) {
          const html = `
            <div data-component-type="s-search-result">
              <h2><a href="/dp/B09XS7JWHH"><span>Sony WH-1000XM5 Amazon</span></a></h2>
              <span class="a-offscreen">$399.00</span>
            </div>
          `;
          return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
        }
        return Promise.resolve({ ok: false, status: 500 });
      }) as jest.Mock;

      const results = await scrapePrices(product, { timeoutMs: 1000, stores: ['jumia', 'amazon'] });
      expect(results).toHaveLength(1);
      expect(results[0].storeName).toBe('Amazon');
    });

    it('preserves Phase 2 retrieval-only rule: does not filter or assign match confidence', async () => {
      global.fetch = jest.fn(() => {
        const html = `
          <div data-component-type="s-search-result">
            <h2><a href="/dp/B001"><span>Sony WH-1000XM5 Replacement Ear Pads Case</span></a></h2>
            <span class="a-offscreen">$19.99</span>
          </div>
          <div data-component-type="s-search-result">
            <h2><a href="/dp/B002"><span>Sony WH-1000XM4 Headphones</span></a></h2>
            <span class="a-offscreen">$298.00</span>
          </div>
        `;
        return Promise.resolve({ ok: true, text: () => Promise.resolve(html) });
      }) as jest.Mock;

      const results = await scrapePrices(product, { timeoutMs: 1000, stores: ['amazon'] });
      // Both the accessory (Ear Pads) and different model (XM4) must be preserved in Phase 2
      expect(results).toHaveLength(2);
      expect(results[0].rawTitle).toContain('Replacement Ear Pads');
      expect(results[1].rawTitle).toContain('WH-1000XM4');
      // No similarity scoring or match confidence has been computed
      expect((results[0] as any).matchConfidence).toBeUndefined();
      expect((results[1] as any).matchConfidence).toBeUndefined();
    });
  });
});
