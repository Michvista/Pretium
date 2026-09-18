import {
  extractAsinFromUrl,
  extractProductFromHtml,
  extractProductFromLink,
  extractSpecsFromText,
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
      "description": "Premium wireless noise canceling headphones with 30-hour battery life",
      "brand": {
        "@type": "Brand",
        "name": "Sony"
      },
      "model": "WH-1000XM5",
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

const JSON_LD_GRAPH_HTML = `<!doctype html>
<html>
<head>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "name": "Tech Store",
          "url": "https://techstore.com"
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Laptops" }
          ]
        },
        {
          "@type": "Product",
          "name": "Dell XPS 15 9530 Laptop",
          "brand": { "@type": "Brand", "name": "Dell" },
          "model": "XPS 15 9530",
          "description": "15.6 inch display, Intel Core i7 processor, 32GB RAM, 1TB SSD storage",
          "additionalProperty": [
            { "@type": "PropertyValue", "name": "Storage", "value": "1TB SSD" },
            { "@type": "PropertyValue", "name": "RAM", "value": "32GB" },
            { "@type": "PropertyValue", "name": "Screen Size", "value": "15.6 inch" }
          ],
          "offers": {
            "@type": "AggregateOffer",
            "lowPrice": "1899.99",
            "highPrice": "2199.99",
            "priceCurrency": "USD",
            "seller": { "@type": "Organization", "name": "Dell Direct" }
          }
        }
      ]
    }
  </script>
</head>
</html>`;

const JSON_LD_ARRAY_HTML = `<!doctype html>
<html>
<head>
  <script type="application/ld+json">
    [
      {
        "@type": "Product",
        "name": "Samsung Galaxy S24 Ultra",
        "brand": "Samsung",
        "model": "SM-S928B",
        "sku": "SAM-S24U-512",
        "mpn": "SM-S928B/DS",
        "offers": [
          {
            "@type": "Offer",
            "price": "1299.99",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock"
          }
        ]
      }
    ]
  </script>
</head>
</html>`;

const MICRODATA_HTML = `<!doctype html>
<html>
<body>
  <div itemscope itemtype="https://schema.org/Product">
    <h1 itemprop="name">Apple MacBook Pro 16"</h1>
    <span itemprop="brand">Apple</span>
    <img itemprop="image" src="https://example.com/macbook.png" alt="MacBook" />
    <p itemprop="description">M3 Max chip, 36GB Unified Memory, 1TB storage</p>
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

  describe('extractSpecsFromText', () => {
    it('extracts explicit specs from text without normalization', () => {
      const text =
        'Features 30-hour battery life, 256GB storage, 6.1-inch display, and Apple M3 Pro chip with 16GB RAM.';
      const specs = extractSpecsFromText(text);

      expect(specs.batteryLife).toBe('30-hour');
      expect(specs.storage).toBe('256GB');
      expect(specs.screenSize).toBe('6.1-inch');
      expect(specs.processor).toBe('Apple M3 Pro');
      expect(specs.ram).toBe('16GB');
    });

    it('returns empty object when text contains no recognizable attributes', () => {
      expect(extractSpecsFromText('Awesome product that you will really enjoy!')).toEqual({});
      expect(extractSpecsFromText('')).toEqual({});
    });
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
    it('extracts rich product metadata and identifiers from standard JSON-LD', () => {
      const data = parseJsonLdProduct(JSON_LD_HTML);
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Sony WH-1000XM5 Headphones');
      expect(data?.brand).toBe('Sony');
      expect(data?.model).toBe('WH-1000XM5');
      expect(data?.price).toBe(398);
      expect(data?.currency).toBe('USD');
      expect(data?.sku).toBe('WH1000XM5-BLK');
      expect(data?.mpn).toBe('WH1000XM5');
      expect(data?.gtin).toBe('0027242923508');
      expect(data?.availability).toBe('InStock');
      expect(data?.imageUrl).toBe('https://m.media-amazon.com/images/I/71xyz.jpg');
    });

    it('extracts Product from complex @graph with multiple mixed non-product nodes', () => {
      const data = parseJsonLdProduct(JSON_LD_GRAPH_HTML);
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Dell XPS 15 9530 Laptop');
      expect(data?.brand).toBe('Dell');
      expect(data?.model).toBe('XPS 15 9530');
      expect(data?.price).toBe(1899.99); // lowPrice from AggregateOffer
      expect(data?.seller).toBe('Dell Direct');
      expect(data?.specifications?.Storage).toBe('1TB SSD');
      expect(data?.specifications?.RAM).toBe('32GB');
      expect(data?.specifications?.['Screen Size']).toBe('15.6 inch');
    });

    it('extracts Product from top-level JSON-LD array', () => {
      const data = parseJsonLdProduct(JSON_LD_ARRAY_HTML);
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Samsung Galaxy S24 Ultra');
      expect(data?.brand).toBe('Samsung');
      expect(data?.model).toBe('SM-S928B');
      expect(data?.price).toBe(1299.99);
      expect(data?.mpn).toBe('SM-S928B/DS');
    });

    it('handles malformed JSON-LD scripts without throwing', () => {
      const malformedHtml = '<script type="application/ld+json">{ invalid json</script>';
      expect(parseJsonLdProduct(malformedHtml)).toBeNull();
    });

    it('recovers when first script tag is malformed but second is valid', () => {
      const mixedHtml = `
        <script type="application/ld+json">{ broken json </script>
        ${JSON_LD_HTML}
      `;
      const data = parseJsonLdProduct(mixedHtml);
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Sony WH-1000XM5 Headphones');
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

  describe('Fallback hierarchy and priority resolution', () => {
    it('prioritizes JSON-LD over Microdata and OpenGraph', () => {
      const fullHtml = `
        <html>
          <head>
            <title>Title Tag Heading</title>
            <meta property="og:title" content="OpenGraph Title">
            <meta property="og:price:amount" content="100.00">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "JSON-LD Winner Title",
                "offers": { "@type": "Offer", "price": "199.99", "priceCurrency": "USD" }
              }
            </script>
          </head>
          <body>
            <div itemscope itemtype="https://schema.org/Product">
              <span itemprop="name">Microdata Runner-Up</span>
              <span itemprop="price">150.00</span>
            </div>
          </body>
        </html>
      `;

      const result = extractProductFromHtml(fullHtml, 'https://example.com/prod');
      expect(result.name).toBe('JSON-LD Winner Title');
      expect(result.price).toBe(199.99);
    });

    it('falls back to Microdata when JSON-LD is missing', () => {
      const result = extractProductFromHtml(MICRODATA_HTML, 'https://example.com/mac');
      expect(result.name).toBe('Apple MacBook Pro 16"');
      expect(result.brand).toBe('Apple');
      expect(result.price).toBe(3499);
      // Explicit specs parsed from description
      expect(result.specifications?.processor).toBe('M3 Max');
      expect(result.specifications?.ram).toBe('36GB');
      expect(result.specifications?.storage).toBe('1TB');
    });

    it('falls back to OpenGraph when JSON-LD and Microdata are missing', () => {
      const result = extractProductFromHtml(OG_HTML, 'https://example.com/shoe');
      expect(result.name).toBe('Nike Air Force 1 & White');
      expect(result.price).toBe(129.99);
    });

    it('falls back to <title> tag when no structured metadata is available', () => {
      const titleOnlyHtml = `
        <html>
          <head>
            <title>Sony PlayStation 5 Console - Slim Edition</title>
          </head>
          <body>
            <p>Some plain text description</p>
          </body>
        </html>
      `;

      const result = extractProductFromHtml(titleOnlyHtml, 'https://example.com/ps5');
      expect(result.name).toBe('Sony PlayStation 5 Console - Slim Edition');
      expect(result.price).toBeNull();
      expect(result.brand).toBeNull();
    });

    it('extracts explicit description attributes into specifications', () => {
      const result = extractProductFromHtml(
        JSON_LD_HTML,
        'https://www.amazon.com/Sony-WH-1000XM5/dp/B09XS7JWHH'
      );
      expect(result.name).toBe('Sony WH-1000XM5 Headphones');
      expect(result.specifications?.batteryLife).toBe('30-hour');
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