import {
  extractAsinFromUrl,
  extractProductFromHtml,
  extractProductFromLink,
  parseJsonLdProduct,
  parseMicrodataProduct,
} from '../src/services/linkExtractor';

const OG_HTML = `<!doctype html>
<html>
<head>
  <title>Nike Air Force 1 &amp; White</title>
  <meta property="og:title" content="Nike Air Force 1 &amp; White">
  <meta property="og:site_name" content="Example Store">
  <meta property="og:description" content="Classic sneaker">
  <meta property="og:image" content="https://img.example.com/shoe.png">
  <meta property="og:price:amount" content="129.99">
  <meta property="og:price:currency" content="USD">
  <meta property="product:availability" content="in_stock">
</head>
</html>`;

const JSON_LD_HTML = `<!doctype html>
<html>
<head>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Sony WH-1000XM5 Headphones",
      "image": "https://m.media-amazon.com/images/I/71xyz.jpg",
      "description": "Premium wireless noise canceling headphones",
      "brand": {
        "@type": "Brand",
        "name": "Sony"
      },
      "sku": "WH1000XM5-BLK",
      "mpn": "WH1000XM5",
      "gtin13": "0027242923508",
      "offers": {
        "@type": "Offer",
        "price": "398.00",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
        "url": "https://www.amazon.com/dp/B09XS7JWHH"
      }
    }
  </script>
</head>
<body></body>
</html>`;

const MICRODATA_HTML = `<!doctype html>
<html>
<body>
  <div itemscope itemtype="https://schema.org/Product">
    <h1 itemprop="name">Apple MacBook Pro 16"</h1>
    <span itemprop="brand">Apple</span>
    <img itemprop="image" src="https://example.com/macbook.png" alt="MacBook" />
    <p itemprop="description">M3 Max chip, 36GB Unified Memory</p>
    <span itemprop="sku">MUW63LL/A</span>
    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <span itemprop="price" content="3499.00">$3,499.00</span>
      <meta itemprop="priceCurrency" content="USD" />
      <link itemprop="availability" href="https://schema.org/InStock" />
    </div>
  </div>
</body>
</html>`;

describe('linkExtractor service', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('OpenGraph extraction (backwards compatibility)', () => {
    it('maps Open Graph tags onto a Product', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://example.com/product',
          text: () => Promise.resolve(OG_HTML),
        })
      ) as jest.Mock;

      const product = await extractProductFromLink('https://example.com/product');
      expect(product).toMatchObject({
        name: 'Nike Air Force 1 & White',
        brand: 'Example Store',
        description: 'Classic sneaker',
        imageUrl: 'https://img.example.com/shoe.png',
        price: 129.99,
        currency: 'USD',
        source: 'link',
        sourceUrl: 'https://example.com/product',
        availability: 'InStock',
      });
      expect(product.specifications?.availability).toBe('InStock');
    });

    it('throws when the URL is unreachable with 404', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, status: 404, url: 'https://example.com/missing' })
      ) as jest.Mock;
      await expect(extractProductFromLink('https://example.com/missing')).rejects.toThrow(
        'HTTP 404 Not Found'
      );
    });

    it('throws descriptive error on HTTP 403 Forbidden (anti-bot)', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, status: 403, url: 'https://amazon.com/blocked' })
      ) as jest.Mock;
      await expect(extractProductFromLink('https://amazon.com/blocked')).rejects.toThrow(
        'HTTP 403 Forbidden'
      );
    });

    it('throws when no product title is present', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://example.com/empty',
          text: () => Promise.resolve('<html><body>empty page</body></html>'),
        })
      ) as jest.Mock;
      await expect(extractProductFromLink('https://example.com/empty')).rejects.toThrow(
        'No product title found on that page.'
      );
    });
  });

  describe('JSON-LD extraction', () => {
    it('extracts rich product metadata and identifiers from JSON-LD', () => {
      const data = parseJsonLdProduct(JSON_LD_HTML);
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Sony WH-1000XM5 Headphones');
      expect(data?.brand).toBe('Sony');
      expect(data?.price).toBe(398);
      expect(data?.currency).toBe('USD');
      expect(data?.sku).toBe('WH1000XM5-BLK');
      expect(data?.mpn).toBe('WH1000XM5');
      expect(data?.gtin).toBe('0027242923508');
      expect(data?.availability).toBe('InStock');
      expect(data?.imageUrl).toBe('https://m.media-amazon.com/images/I/71xyz.jpg');
    });

    it('handles malformed JSON-LD scripts without throwing', () => {
      const malformedHtml = '<script type="application/ld+json">{ invalid json</script>';
      expect(parseJsonLdProduct(malformedHtml)).toBeNull();
    });
  });

  describe('HTML Microdata extraction', () => {
    it('extracts product fields and price from Microdata tags', () => {
      const data = parseMicrodataProduct(MICRODATA_HTML);
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Apple MacBook Pro 16"');
      expect(data?.brand).toBe('Apple');
      expect(data?.price).toBe(3499);
      expect(data?.currency).toBe('USD');
      expect(data?.sku).toBe('MUW63LL/A');
      expect(data?.availability).toBe('InStock');
      expect(data?.imageUrl).toBe('https://example.com/macbook.png');
    });
  });

  describe('ASIN extraction from URL', () => {
    it('extracts ASIN from standard Amazon product URL patterns', () => {
      expect(
        extractAsinFromUrl(
          'https://www.amazon.com/Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH?ref=xyz'
        )
      ).toBe('B09XS7JWHH');

      expect(
        extractAsinFromUrl('https://www.amazon.com/gp/product/B08N5WRWNW')
      ).toBe('B08N5WRWNW');

      expect(extractAsinFromUrl('https://example.com/non-amazon')).toBeNull();
    });
  });

  describe('Layer merging and priority resolution', () => {
    it('prioritizes JSON-LD over OpenGraph while backfilling siteName from OG', () => {
      const combinedHtml = `
        <html>
          <head>
            <meta property="og:title" content="Low Quality OG Title">
            <meta property="og:site_name" content="Best Buy">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "High Quality JSON-LD Product Title",
                "offers": {
                  "@type": "Offer",
                  "price": "299.99",
                  "priceCurrency": "USD"
                }
              }
            </script>
          </head>
        </html>
      `;

      const result = extractProductFromHtml(combinedHtml, 'https://bestbuy.com/item/123');
      expect(result.name).toBe('High Quality JSON-LD Product Title');
      expect(result.price).toBe(299.99);
      expect(result.brand).toBe('Best Buy'); // backfilled from og:site_name
      expect(result.retailer).toBe('Best Buy');
    });

    it('attaches Amazon ASIN identifier when extracting from an Amazon link', () => {
      const result = extractProductFromHtml(
        JSON_LD_HTML,
        'https://www.amazon.com/Sony-WH-1000XM5/dp/B09XS7JWHH'
      );
      expect(result.identifiers?.asin).toBe('B09XS7JWHH');
      expect(result.identifiers?.sku).toBe('WH1000XM5-BLK');
      expect(result.identifiers?.mpn).toBe('WH1000XM5');
      expect(result.identifiers?.gtin).toBe('0027242923508');
    });
  });

  describe('Redirect handling', () => {
    it('preserves the final redirected canonical URL as sourceUrl', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://www.example.com/canonical-product-slug', // redirected from short link
          text: () => Promise.resolve(OG_HTML),
        })
      ) as jest.Mock;

      const product = await extractProductFromLink('https://short.ly/xyz');
      expect(product.sourceUrl).toBe('https://www.example.com/canonical-product-slug');
    });
  });

  describe('Timeout handling', () => {
    it('throws timeout error when request exceeds timeoutMs', async () => {
      global.fetch = jest.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }) as jest.Mock;

      await expect(
        extractProductFromLink('https://example.com/slow', { timeoutMs: 50 })
      ).rejects.toThrow('Request timed out while loading that product link');
    });
  });
});