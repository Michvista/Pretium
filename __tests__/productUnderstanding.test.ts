import {
  extractProductFromImage,
  parseGeminiResponse,
  buildSearchQuery as buildGeminiSearchQuery,
} from '../src/services/gemini';
import {
  extractProductFromHtml,
  extractProductFromLink,
  parseJsonLdProduct,
  parseMicrodataProduct,
  extractSpecsFromText,
} from '../src/services/linkExtractor';
import { parseTextQuery } from '../src/services/queryParser';
import {
  canonicalToProduct,
  isCanonicalProduct,
  synthesizeCanonicalProduct,
  synthesizeFromImageProduct,
  synthesizeFromLinkProduct,
  synthesizeFromParsedQuery,
  synthesizeFromTextProduct,
} from '../src/services/productSynthesizer';
import type { CanonicalProduct, Product } from '../src/types';

// ============================================================================
// 1. GEMINI VISION EXTRACTION TESTS
// ============================================================================
describe('Phase 3.6: Gemini Vision Extraction', () => {
  const originalEnv = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalEnv;
    jest.restoreAllMocks();
  });

  it('parses valid structured JSON response from Gemini', () => {
    const rawResponse = JSON.stringify({
      isProduct: true,
      name: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'Electronics',
      color: 'Black',
      condition: 'new',
      identifiers: {
        modelNumber: 'WH-1000XM5',
        mpn: 'WH1000XM5/B',
        upc: '027242923508',
      },
      specifications: {
        connectivity: 'Bluetooth 5.2',
        batteryLife: '30 hours',
        noiseCanceling: 'Active',
      },
      visibleText: ['Sony', 'WH-1000XM5', 'ANC', '30hr'],
    });

    const parsed = parseGeminiResponse(rawResponse);
    expect(parsed.isProduct).toBe(true);
    expect(parsed.name).toContain('Sony WH-1000XM5');
    expect(parsed.brand).toBe('Sony');
    expect(parsed.model).toBe('WH-1000XM5');
    expect(parsed.category).toBe('Electronics');
    expect(parsed.color).toBe('Black');
    expect(parsed.condition).toBe('new');
    expect(parsed.identifiers?.mpn).toBe('WH1000XM5/B');
    expect(parsed.specifications?.batteryLife).toBe('30 hours');
    expect(parsed.visibleText).toContain('Sony');
  });

  it('extracts primary product fields and maps to Product model via extractProductFromImage', async () => {
    const mockData = {
      isProduct: true,
      name: 'MacBook Pro 16" M3 Max',
      brand: 'Apple',
      model: 'MacBook Pro 16',
      category: 'Computers & Laptops',
      color: 'Space Black',
      condition: 'new',
      specifications: {
        storage: '1TB SSD',
        ram: '36GB Unified Memory',
        chip: 'Apple M3 Max',
        screenSize: '16.2 inch',
      },
      identifiers: {
        mpn: 'MUW63LL/A',
        sku: 'APL-MBP16-M3M',
      },
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockData) }],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;

    const product = await extractProductFromImage('file:///test.jpg', 'base64_data');

    expect(product.name).toBe('MacBook Pro 16" M3 Max');
    expect(product.brand).toBe('Apple');
    expect(product.model).toBe('MacBook Pro 16');
    expect(product.category).toBe('Computers & Laptops');
    expect(product.color).toBe('Space Black');
    expect(product.condition).toBe('new');
    expect(product.source).toBe('image');
    expect(product.identifiers?.mpn).toBe('MUW63LL/A');
    expect(product.identifiers?.sku).toBe('APL-MBP16-M3M');
    expect(product.specifications?.storage).toBe('1TB SSD');
    expect(product.specifications?.ram).toBe('36GB Unified Memory');
  });

  it('handles image with missing brand gracefully', async () => {
    const mockData = {
      isProduct: true,
      name: 'Wireless Ergonomic Mechanical Keyboard',
      brand: null,
      model: 'K8 Pro',
      category: 'Computer Accessories',
      specifications: {
        switchType: 'Gateron Brown',
        layout: '75%',
      },
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockData) }],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;

    const product = await extractProductFromImage('file:///unbranded.jpg', 'base64_data');

    expect(product.name).toBe('Wireless Ergonomic Mechanical Keyboard');
    expect(product.brand).toBeNull();
    expect(product.model).toBe('K8 Pro');
    expect(product.specifications?.switchType).toBe('Gateron Brown');
    expect(product.searchQuery).toBeDefined();
  });

  it('handles image with missing model safely', async () => {
    const mockData = {
      isProduct: true,
      name: 'Nike Men Running Shoe',
      brand: 'Nike',
      model: null,
      category: 'Footwear',
      color: 'Triple White',
      size: 'US 11',
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockData) }],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;

    const product = await extractProductFromImage('file:///shoe.jpg', 'base64_data');

    expect(product.brand).toBe('Nike');
    expect(product.model).toBeNull();
    expect(product.color).toBe('Triple White');
    expect(product.size).toBe('US 11');
  });

  it('handles image with missing specifications safely', async () => {
    const mockData = {
      isProduct: true,
      name: 'Hydro Flask Water Bottle 32oz',
      brand: 'Hydro Flask',
      category: 'Kitchen & Dining',
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockData) }],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;

    const product = await extractProductFromImage('file:///bottle.jpg', 'base64_data');

    expect(product.name).toBe('Hydro Flask Water Bottle 32oz');
    expect(product.brand).toBe('Hydro Flask');
    expect(product.specifications).toBeUndefined();
    expect(product.identifiers).toBeUndefined();
  });

  it('throws descriptive error on malformed Gemini JSON response', () => {
    const malformedText = '```json\n{ "name": "Broken Product", "brand": \n```';
    expect(() => parseGeminiResponse(malformedText)).toThrow(
      'Could not parse product details from Gemini response.'
    );
  });

  it('throws descriptive error on empty Gemini response', () => {
    expect(() => parseGeminiResponse('')).toThrow('empty response');
    expect(() => parseGeminiResponse('   ')).toThrow('empty response');
  });

  it('handles partial extraction where only name is identified', async () => {
    const mockData = {
      isProduct: true,
      name: 'Mystery Vintage Watch',
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockData) }],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;

    const product = await extractProductFromImage('file:///watch.jpg', 'base64_data');

    expect(product.name).toBe('Mystery Vintage Watch');
    expect(product.brand).toBeNull();
    expect(product.model).toBeNull();
  });

  it('rejects unsupported or non-product images with user-friendly reason', async () => {
    const mockData = {
      isProduct: false,
      reason: 'This image appears to be a landscape photograph, not a consumer product.',
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockData) }],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;

    await expect(
      extractProductFromImage('file:///mountain.jpg', 'base64_data')
    ).rejects.toThrow('This image appears to be a landscape photograph, not a consumer product.');
  });
});

// ============================================================================
// 2. WEB / URL SEMANTIC EXTRACTION TESTS
// ============================================================================
describe('Phase 3.6: URL Semantic Extraction', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts valid schema.org Product JSON-LD with nested offers and identifiers', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Bose QuietComfort Ultra Headphones",
          "image": "https://example.com/bose-qc-ultra.jpg",
          "description": "Spatial audio noise canceling wireless headphones with custom tune technology",
          "brand": {
            "@type": "Brand",
            "name": "Bose"
          },
          "model": "QC Ultra",
          "sku": "880066-0100",
          "mpn": "880066-0100",
          "gtin13": "0017817845625",
          "color": "Black",
          "offers": {
            "@type": "Offer",
            "price": "429.00",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock",
            "seller": {
              "@type": "Organization",
              "name": "Bose Direct"
            }
          }
        }
      </script>
    </head>
    <body></body>
    </html>`;

    const product = extractProductFromHtml(html, 'https://bose.com/p/qc-ultra');

    expect(product.name).toBe('Bose QuietComfort Ultra Headphones');
    expect(product.brand).toBe('Bose');
    expect(product.model).toBe('QC Ultra');
    expect(product.price).toBe(429);
    expect(product.currency).toBe('USD');
    expect(product.availability).toBe('InStock');
    expect(product.retailer).toBe('Bose Direct');
    expect(product.identifiers?.sku).toBe('880066-0100');
    expect(product.identifiers?.mpn).toBe('880066-0100');
    expect(product.identifiers?.gtin).toBe('0017817845625');
    expect(product.specifications?.color).toBe('Black');
  });

  it('extracts product data from @graph JSON-LD structure', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": "https://store.google.com/product/pixel_8_pro",
              "name": "Google Pixel 8 Pro"
            },
            {
              "@type": "Product",
              "name": "Google Pixel 8 Pro 128GB Bay Blue",
              "brand": "Google",
              "model": "Pixel 8 Pro",
              "description": "Advanced smartphone with 12GB RAM, 128GB storage, 50MP camera",
              "offers": {
                "@type": "Offer",
                "price": "799.00",
                "priceCurrency": "USD",
                "availability": "http://schema.org/InStock"
              }
            }
          ]
        }
      </script>
    </head>
    </html>`;

    const product = extractProductFromHtml(html, 'https://store.google.com/product/pixel_8_pro');

    expect(product.name).toBe('Google Pixel 8 Pro 128GB Bay Blue');
    expect(product.brand).toBe('Google');
    expect(product.model).toBe('Pixel 8 Pro');
    expect(product.price).toBe(799);
    expect(product.availability).toBe('InStock');
    expect(product.specifications?.ram).toBe('12GB');
    expect(product.specifications?.storage).toBe('128GB');
  });

  it('extracts from array of JSON-LD products', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <script type="application/ld+json">
        [
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Logitech MX Master 3S Wireless Mouse",
            "brand": { "@type": "Brand", "name": "Logitech" },
            "offers": {
              "@type": "Offer",
              "price": "99.99",
              "priceCurrency": "USD"
            }
          }
        ]
      </script>
    </head>
    </html>`;

    const product = extractProductFromHtml(html, 'https://example.com/logitech-mx');

    expect(product.name).toBe('Logitech MX Master 3S Wireless Mouse');
    expect(product.brand).toBe('Logitech');
    expect(product.price).toBe(99.99);
  });

  it('extracts AggregateOffer with lowPrice and highPrice', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Sony PlayStation 5 Console (Slim)",
          "offers": {
            "@type": "AggregateOffer",
            "lowPrice": "449.99",
            "highPrice": "499.99",
            "priceCurrency": "USD",
            "offerCount": "5"
          }
        }
      </script>
    </head>
    </html>`;

    const product = extractProductFromHtml(html, 'https://example.com/ps5-slim');

    expect(product.price).toBe(449.99);
    expect(product.currency).toBe('USD');
  });

  it('extracts ASIN identifier directly from Amazon product URL', () => {
    const html = `<!doctype html>
    <html>
    <head><title>Amazon.com: Sony Headphones</title></head>
    <body></body>
    </html>`;

    const product = extractProductFromHtml(
      html,
      'https://www.amazon.com/Sony-WH-1000XM5-Canceling-Headphones-B09XS7JWHH/dp/B09XS7JWHH?ref_=ast_sto_dp'
    );

    expect(product.identifiers?.asin).toBe('B09XS7JWHH');
  });

  it('extracts explicit specifications from product description text', () => {
    const desc = 'Equipped with 32GB RAM, blazing fast 2TB SSD storage, and a 16-inch display.';
    const specs = extractSpecsFromText(desc);

    expect(specs.ram).toBe('32GB');
    expect(specs.storage).toBe('2TB');
    expect(specs.screenSize).toBe('16-inch');
  });

  it('falls back to Microdata when JSON-LD is absent', () => {
    const html = `<!doctype html>
    <html>
    <body>
      <div itemscope itemtype="http://schema.org/Product">
        <h1 itemprop="name">Asus ROG Zephyrus G16 Gaming Laptop</h1>
        <span itemprop="brand">Asus</span>
        <meta itemprop="sku" content="GU605MY-XS96">
        <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
          <span itemprop="price">2899.99</span>
          <meta itemprop="priceCurrency" content="USD">
          <link itemprop="availability" href="http://schema.org/InStock">
        </div>
      </div>
    </body>
    </html>`;

    const product = extractProductFromHtml(html, 'https://asus.com/laptops/g16');

    expect(product.name).toBe('Asus ROG Zephyrus G16 Gaming Laptop');
    expect(product.brand).toBe('Asus');
    expect(product.identifiers?.sku).toBe('GU605MY-XS96');
    expect(product.price).toBe(2899.99);
    expect(product.currency).toBe('USD');
    expect(product.availability).toBe('InStock');
  });

  it('falls back to OpenGraph meta tags when structured data is absent', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <meta property="og:title" content="Nike Air Zoom Pegasus 40">
      <meta property="og:description" content="Responsive road running shoes with breathable engineered mesh">
      <meta property="og:image" content="https://nike.com/pegasus.jpg">
      <meta property="og:price:amount" content="130.00">
      <meta property="og:price:currency" content="USD">
      <meta property="product:availability" content="instock">
    </head>
    </html>`;

    const product = extractProductFromHtml(html, 'https://nike.com/pegasus-40');

    expect(product.name).toBe('Nike Air Zoom Pegasus 40');
    expect(product.description).toContain('Responsive road running shoes');
    expect(product.imageUrl).toBe('https://nike.com/pegasus.jpg');
    expect(product.price).toBe(130.0);
    expect(product.currency).toBe('USD');
    expect(product.availability).toBe('InStock');
  });

  it('falls back to <title> tag when no structured data or OpenGraph is present', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <title>KitchenAid Artisan Series 5-Quart Stand Mixer | Store Name</title>
    </head>
    <body></body>
    </html>`;

    const product = extractProductFromHtml(html, 'https://kitchen.com/mixer');

    expect(product.name).toBe('KitchenAid Artisan Series 5-Quart Stand Mixer | Store Name');
  });

  it('resiliently handles malformed JSON-LD scripts without crashing', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <script type="application/ld+json">
        { "name": "Malformed JSON", "price": 499.00, BROKEN_SYNTAX
      </script>
      <meta property="og:title" content="Fallback Valid Name">
      <meta property="og:price:amount" content="499.00">
    </head>
    </html>`;

    const product = extractProductFromHtml(html, 'https://example.com/broken-json');

    expect(product.name).toBe('Fallback Valid Name');
    expect(product.price).toBe(499);
  });

  it('resiliently handles incomplete/truncated HTML documents', () => {
    const truncatedHtml = '<title>Truncated Product Page</title><div>Incomplete body content...';
    const product = extractProductFromHtml(truncatedHtml, 'https://example.com/truncated');

    expect(product.name).toBe('Truncated Product Page');
  });

  it('handles HTTP 403 Forbidden retailer blocking in extractProductFromLink', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
      })
    ) as jest.Mock;

    await expect(
      extractProductFromLink('https://protected-retailer.com/item')
    ).rejects.toThrow('HTTP 403 Forbidden: retailer blocked request');
  });

  it('handles HTTP 404 Not Found in extractProductFromLink', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
      })
    ) as jest.Mock;

    await expect(
      extractProductFromLink('https://example.com/nonexistent-item')
    ).rejects.toThrow('HTTP 404 Not Found');
  });

  it('handles network failures gracefully in extractProductFromLink', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network connection offline')));

    await expect(
      extractProductFromLink('https://example.com/network-error')
    ).rejects.toThrow('Could not load that link: Network connection offline');
  });
});

// ============================================================================
// 3. RAW TEXT QUERY ENTITY PARSING TESTS
// ============================================================================
describe('Phase 3.6: Raw Text Query Entity Parsing', () => {
  it('parses benchmark: "iPhone 16 Pro 256GB Space Black"', () => {
    const result = parseTextQuery('iPhone 16 Pro 256GB Space Black');

    expect(result.originalQuery).toBe('iPhone 16 Pro 256GB Space Black');
    expect(result.series).toBe('iPhone');
    expect(result.model).toContain('16 Pro');
    expect(result.storage).toBe('256GB');
    expect(result.color).toBe('Space Black');
    expect(result.specifications.storage).toBe('256GB');
    expect(result.specifications.color).toBe('Space Black');
  });

  it('parses benchmark: "Nike Air Force 1 07 white size 10"', () => {
    const result = parseTextQuery('Nike Air Force 1 07 white size 10');

    expect(result.brand).toBe('Nike');
    expect(result.series).toBe('Air Force 1');
    expect(result.edition).toBe('07');
    expect(result.color).toBe('white');
    expect(result.size).toBe('size 10');
    expect(result.specifications.color).toBe('white');
    expect(result.specifications.size).toBe('size 10');
    expect(result.specifications.edition).toBe('07');
  });

  it('parses benchmark: "Adidas Samba OG US 10"', () => {
    const result = parseTextQuery('Adidas Samba OG US 10');

    expect(result.brand).toBe('Adidas');
    expect(result.series).toBe('Samba');
    expect(result.edition).toBe('OG');
    expect(result.size).toBe('US 10');
    expect(result.specifications.size).toBe('US 10');
    expect(result.specifications.edition).toBe('OG');
  });

  it('parses benchmark: "Sony WH-1000XM5 black"', () => {
    const result = parseTextQuery('Sony WH-1000XM5 black');

    expect(result.brand).toBe('Sony');
    expect(result.modelNumber).toBe('WH-1000XM5');
    expect(result.identifiers?.mpn).toBe('WH-1000XM5');
    expect(result.color).toBe('black');
    expect(result.specifications.color).toBe('black');
    expect(result.specifications.modelNumber).toBe('WH-1000XM5');
  });

  it('parses hardware model numbers and style codes correctly', () => {
    const phoneResult = parseTextQuery('Samsung Galaxy S24 Ultra SM-S928B Black Titanium');
    expect(phoneResult.brand).toBe('Samsung');
    expect(phoneResult.modelNumber).toBe('SM-S928B');
    expect(phoneResult.identifiers?.mpn).toBe('SM-S928B');
    expect(phoneResult.color).toBe('Black Titanium');

    const shoeResult = parseTextQuery('Nike Air Jordan 1 Retro High OG DZ5485-612');
    expect(shoeResult.brand).toBe('Air Jordan');
    expect(shoeResult.styleCode).toBe('DZ5485-612');
    expect(shoeResult.specifications.styleCode).toBe('DZ5485-612');
  });

  it('parses RAM and storage separately in laptop queries', () => {
    const result = parseTextQuery('Lenovo ThinkPad X1 Carbon Gen 11 32GB RAM 1TB SSD');

    expect(result.brand).toBe('Lenovo');
    expect(result.series).toBe('ThinkPad');
    expect(result.ram).toBe('32GB');
    expect(result.storage).toBe('1TB');
    expect(result.specifications.ram).toBe('32GB');
    expect(result.specifications.storage).toBe('1TB');
  });

  it('parses apparel sizes and waist/inseam measurements', () => {
    const pantsResult = parseTextQuery("Levi's 501 Original Fit Jeans 32x32 Medium Stonewash");
    expect(pantsResult.brand).toBe("Levi's");
    expect(pantsResult.size).toBe('32x32');
    expect(pantsResult.specifications.size).toBe('32x32');

    const hoodieResult = parseTextQuery('Nike Club Fleece Pullover Hoodie Size XL Grey');
    expect(hoodieResult.brand).toBe('Nike');
    expect(hoodieResult.size).toBe('Size XL');
    expect(hoodieResult.color).toBe('Grey');
  });

  it('parses queries without explicit brands safely', () => {
    const result = parseTextQuery('55 inch OLED 4K Smart TV 120Hz');

    expect(result.brand).toBeNull();
    expect(result.name).toBe('55 inch OLED 4K Smart TV 120Hz');
    expect(result.originalQuery).toBe('55 inch OLED 4K Smart TV 120Hz');
  });

  it('handles ambiguous short queries safely without hallucinating entities', () => {
    const genericShoe = parseTextQuery('running shoes');
    expect(genericShoe.brand).toBeNull();
    expect(genericShoe.storage).toBeNull();
    expect(genericShoe.ram).toBeNull();
    expect(genericShoe.color).toBeNull();
    expect(genericShoe.size).toBeNull();

    const shortQuery = parseTextQuery('headphones');
    expect(shortQuery.name).toBe('headphones');
    expect(shortQuery.originalQuery).toBe('headphones');
  });
});

// ============================================================================
// 4. STRUCTURED PRODUCT REPRESENTATION SYNTHESIZER TESTS
// ============================================================================
describe('Phase 3.6: Structured Product Representation Synthesizer', () => {
  it('synthesizes image Product into CanonicalProduct with full provenance and identifiers', () => {
    const imageProduct: Product = {
      id: 'img_prod_1',
      name: 'Sony WH-1000XM5',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'Audio',
      color: 'Silver',
      condition: 'new',
      source: 'image',
      imageUrl: 'file:///sony_shot.jpg',
      searchQuery: 'Sony WH-1000XM5 Silver',
      identifiers: {
        mpn: 'WH1000XM5/S',
        upc: '027242923515',
      },
      specifications: {
        color: 'Silver',
        batteryLife: '30h',
      },
    };

    const canonical = synthesizeCanonicalProduct(imageProduct);

    expect(canonical.id).toBe('img_prod_1');
    expect(canonical.name).toBe('Sony WH-1000XM5');
    expect(canonical.brand).toBe('Sony');
    expect(canonical.model).toBe('WH-1000XM5');
    expect(canonical.category).toBe('Audio');
    expect(canonical.source).toBe('image');
    expect(canonical.sourceUrl).toBe('file:///sony_shot.jpg');
    expect(canonical.condition).toBe('new');
    expect(canonical.identifiers.mpn).toBe('WH1000XM5/S');
    expect(canonical.identifiers.upc).toBe('027242923515');
    expect(canonical.specifications.batteryLife).toBe('30h');
    expect(isCanonicalProduct(canonical)).toBe(true);
  });

  it('synthesizes URL extraction into CanonicalProduct with sourceUrl and SKU/ASIN', () => {
    const urlData = {
      name: 'Apple iPhone 15 Pro 128GB Natural Titanium',
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      category: null,
      price: 999.0,
      currency: 'USD' as const,
      source: 'link' as const,
      sourceUrl: 'https://amazon.com/dp/B0CHX24LGB',
      searchQuery: 'Apple iPhone 15 Pro 128GB Natural Titanium',
      identifiers: {
        asin: 'B0CHX24LGB',
        sku: 'MTUP3LL/A',
      },
      specifications: {
        storage: '128GB',
        color: 'Natural Titanium',
        availability: 'in_stock',
      },
    };

    const canonical = synthesizeCanonicalProduct(urlData);

    expect(canonical.source).toBe('link');
    expect(canonical.sourceUrl).toBe('https://amazon.com/dp/B0CHX24LGB');
    expect(canonical.identifiers.asin).toBe('B0CHX24LGB');
    expect(canonical.identifiers.sku).toBe('MTUP3LL/A');
    expect(canonical.specifications.storage).toBe('128GB');
    expect(canonical.specifications.availability).toBe('in_stock');
    expect(isCanonicalProduct(canonical)).toBe(true);
  });

  it('synthesizes text query into CanonicalProduct from raw string input', () => {
    const canonical = synthesizeCanonicalProduct('Nike Air Force 1 07 white size 10');

    expect(canonical.source).toBe('text');
    expect(canonical.sourceUrl).toBeNull();
    expect(canonical.brand).toBe('Nike');
    expect(canonical.specifications.color).toBe('white');
    expect(canonical.specifications.size).toBe('size 10');
    expect(canonical.specifications.edition).toBe('07');
    expect(canonical.searchQuery).toBeDefined();
    expect(isCanonicalProduct(canonical)).toBe(true);
  });

  it('removes duplicate tokens from the generated search query', () => {
    const parsed = parseTextQuery('Sony Sony WH-1000XM5 Headphones WH-1000XM5 Black');
    const canonical = synthesizeFromParsedQuery(parsed);

    const tokens = canonical.searchQuery.split(/\s+/);
    const sonyCount = tokens.filter((t) => t.toLowerCase() === 'sony').length;
    const modelCount = tokens.filter((t) => t.toLowerCase() === 'wh-1000xm5').length;

    expect(sonyCount).toBe(1);
    expect(modelCount).toBe(1);
  });

  it('strictly preserves raw extracted values without performing premature normalization', () => {
    // 1 TB should NOT be converted to 1024 GB or 1000 GB in Phase 3
    const parsed = parseTextQuery('MacBook Pro 1TB Triple Black');
    const canonical = synthesizeFromParsedQuery(parsed);

    expect(canonical.specifications.storage).toBe('1TB');
    expect(canonical.specifications.storage).not.toBe('1024GB');
    expect(canonical.specifications.color).toBe('Triple Black');
    expect(canonical.specifications.color).not.toBe('Black');
  });

  it('converts CanonicalProduct back to UI Product with backwards compatibility', () => {
    const canonical: CanonicalProduct = {
      id: 'cp_test_123',
      name: 'Samsung Galaxy S24 Ultra',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      category: 'Smartphones',
      specifications: {
        color: 'Titanium Grey',
        storage: '512GB',
      },
      identifiers: {
        mpn: 'SM-S928B',
      },
      source: 'text',
      sourceUrl: null,
      searchQuery: 'Samsung Galaxy S24 Ultra Titanium Grey 512GB',
    };

    const uiProduct = canonicalToProduct(canonical, { imageUrl: 'https://img.example.com/s24.png' });

    expect(uiProduct.id).toBe('cp_test_123');
    expect(uiProduct.name).toBe('Samsung Galaxy S24 Ultra');
    expect(uiProduct.brand).toBe('Samsung');
    expect(uiProduct.model).toBe('Galaxy S24 Ultra');
    expect(uiProduct.color).toBe('Titanium Grey');
    expect(uiProduct.imageUrl).toBe('https://img.example.com/s24.png');
    expect(uiProduct.specifications?.storage).toBe('512GB');
  });
});

// ============================================================================
// 5. PARTIAL-INPUT & RESILIENCE VALIDATION
// ============================================================================
describe('Phase 3.6: Partial-Input & Resilience Validation', () => {
  it('handles input with brand = null safely without throwing', () => {
    const product: Product = {
      id: 'partial_1',
      name: '4K Action Camera 60FPS',
      brand: null,
      model: null,
      source: 'text',
      searchQuery: '4K Action Camera 60FPS',
    };

    const canonical = synthesizeCanonicalProduct(product);

    expect(canonical.brand).toBeNull();
    expect(canonical.name).toBe('4K Action Camera 60FPS');
    expect(canonical.searchQuery).toBeDefined();
    expect(isCanonicalProduct(canonical)).toBe(true);
  });

  it('handles input with model = null safely without throwing', () => {
    const product: Product = {
      id: 'partial_2',
      name: 'Sony Audio Accessory',
      brand: 'Sony',
      model: null,
      source: 'image',
      searchQuery: 'Sony Audio Accessory',
    };

    const canonical = synthesizeCanonicalProduct(product);

    expect(canonical.brand).toBe('Sony');
    expect(canonical.model).toBeNull();
    expect(canonical.name).toBe('Sony Audio Accessory');
    expect(isCanonicalProduct(canonical)).toBe(true);
  });

  it('handles URL input missing price without crashing', () => {
    const html = `<!doctype html>
    <html>
    <head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Out of Stock Exclusive Item",
          "brand": "Special Brand"
        }
      </script>
    </head>
    </html>`;

    const extracted = extractProductFromHtml(html, 'https://example.com/no-price');
    expect(extracted.name).toBe('Out of Stock Exclusive Item');
    expect(extracted.price).toBeNull();

    const canonical = synthesizeFromLinkProduct(extracted);
    expect(canonical.name).toBe('Out of Stock Exclusive Item');
    expect(canonical.brand).toBe('Special Brand');
    expect(isCanonicalProduct(canonical)).toBe(true);
  });

  it('handles empty specifications and identifiers dictionaries without throwing', () => {
    const product: Product = {
      id: 'partial_3',
      name: 'Basic Ceramic Coffee Mug',
      source: 'text',
      specifications: {},
      identifiers: {},
      searchQuery: 'Basic Ceramic Coffee Mug',
    };

    const canonical = synthesizeCanonicalProduct(product);

    expect(canonical.specifications).toEqual({});
    expect(canonical.identifiers).toEqual({});
    expect(isCanonicalProduct(canonical)).toBe(true);
  });

  it('validates isCanonicalProduct type guard boundary conditions', () => {
    expect(isCanonicalProduct(null)).toBe(false);
    expect(isCanonicalProduct(undefined)).toBe(false);
    expect(isCanonicalProduct('string')).toBe(false);
    expect(isCanonicalProduct(123)).toBe(false);
    expect(isCanonicalProduct({})).toBe(false);
    expect(isCanonicalProduct({ id: '1', name: 'Incomplete' })).toBe(false);
  });
});
