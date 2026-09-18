import { buildSearchQuery, parseGeminiResponse } from '../src/services/gemini';

describe('buildSearchQuery', () => {
  it('combines brand, name, model, color, size', () => {
    expect(
      buildSearchQuery({ name: 'Air Force 1', brand: 'Nike', model: 'Low', color: 'White', size: 'US 10' })
    ).toBe('Nike Air Force 1 Low White US 10');
  });

  it('skips empty/null parts', () => {
    expect(buildSearchQuery({ name: 'iPhone 16', brand: null, model: 'Pro', color: '', size: undefined })).toBe(
      'iPhone 16 Pro'
    );
  });
});

describe('parseGeminiResponse', () => {
  it('parses valid raw JSON directly', () => {
    const raw = JSON.stringify({ isProduct: true, name: 'Air Jordan 1' });
    const result = parseGeminiResponse(raw);
    expect(result).toEqual({ isProduct: true, name: 'Air Jordan 1' });
  });

  it('strips markdown code block fences (```json ... ```)', () => {
    const raw = '```json\n{\n  "isProduct": true,\n  "name": "MacBook Pro"\n}\n```';
    const result = parseGeminiResponse(raw);
    expect(result.name).toBe('MacBook Pro');
  });

  it('extracts JSON when surrounded by conversational text', () => {
    const raw = 'Here is the identified product: {"isProduct": true, "name": "Sony Headphones"} Hope this helps!';
    const result = parseGeminiResponse(raw);
    expect(result.name).toBe('Sony Headphones');
  });

  it('throws an error on empty or whitespace text', () => {
    expect(() => parseGeminiResponse('')).toThrow('empty response');
    expect(() => parseGeminiResponse('   ')).toThrow('empty response');
  });

  it('throws an error on malformed/invalid JSON syntax', () => {
    expect(() => parseGeminiResponse('{ invalid json string')).toThrow(
      'Could not parse product details'
    );
  });
});

describe('extractProductFromImage', () => {
  let extractProductFromImage: typeof import('../src/services/gemini').extractProductFromImage;

  const mockGeminiResponse = (responseData: any, status = 200, isOk = true) => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: isOk,
        status,
        text: () => Promise.resolve(typeof responseData === 'string' ? responseData : JSON.stringify(responseData)),
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
                    },
                  ],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-gemini-key';
    extractProductFromImage = require('../src/services/gemini').extractProductFromImage;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when the Gemini API key is missing', async () => {
    delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    extractProductFromImage = require('../src/services/gemini').extractProductFromImage;
    await expect(extractProductFromImage('file:///tmp.png', 'base64')).rejects.toThrow(
      'EXPO_PUBLIC_GEMINI_API_KEY'
    );
  });

  it('throws when Gemini HTTP response fails with non-200 code', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      })
    ) as jest.Mock;

    await expect(extractProductFromImage('file:///tmp.png', 'base64')).rejects.toThrow(
      'Gemini error 500'
    );
  });

  it('throws when Gemini returns an empty response without candidates', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ candidates: [] }),
      })
    ) as jest.Mock;

    await expect(extractProductFromImage('file:///tmp.png', 'base64')).rejects.toThrow(
      'no content'
    );
  });

  it('extracts clear product photo with structured specifications and clean query', async () => {
    mockGeminiResponse({
      isProduct: true,
      name: 'Sony WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      series: '1000X',
      category: 'headphones',
      color: 'Black',
      description: 'Over-ear wireless noise canceling headphones',
      specifications: {
        connectivity: 'Bluetooth 5.2',
        batteryLife: '30 hours',
      },
    });

    const product = await extractProductFromImage('file:///headphone.jpg', 'base64');
    expect(product).toMatchObject({
      name: 'Sony WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      color: 'Black',
      category: 'headphones',
      source: 'image',
      imageUrl: 'file:///headphone.jpg',
    });
    expect(product.specifications).toMatchObject({
      series: '1000X',
      connectivity: 'Bluetooth 5.2',
      batteryLife: '30 hours',
    });
    // Search query synthesized cleanly without redundant duplicates
    expect(product.searchQuery).toBe('Sony WH-1000XM5 Wireless Headphones Black');
  });

  it('extracts screenshot of product listing with storage and screen specs', async () => {
    mockGeminiResponse({
      isProduct: true,
      name: 'iPhone 16 Pro',
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      category: 'smartphones',
      color: 'Space Black',
      specifications: {
        storage: '256 GB',
        ram: '8 GB',
        screenSize: '6.1 inch',
        releaseYear: 2024,
      },
      identifiers: {
        mpn: 'MYNW3LL/A',
      },
    });

    const product = await extractProductFromImage('file:///screenshot.png', 'base64');
    expect(product.name).toBe('iPhone 16 Pro');
    expect(product.brand).toBe('Apple');
    expect(product.color).toBe('Space Black');
    expect(product.specifications?.storage).toBe('256 GB');
    expect(product.specifications?.ram).toBe('8 GB');
    expect(product.specifications?.screenSize).toBe('6.1 inch');
    expect(product.specifications?.releaseYear).toBe(2024);
    expect(product.identifiers?.mpn).toBe('MYNW3LL/A');
  });

  it('extracts packaging image with barcode, style code, and condition: new', async () => {
    mockGeminiResponse({
      isProduct: true,
      name: 'Nike Air Jordan 1 Retro High OG',
      brand: 'Nike',
      model: 'Air Jordan 1',
      series: 'Air Jordan',
      color: 'Lost and Found',
      size: 'US 10.5',
      gender: "Men's",
      condition: 'new',
      styleCode: 'DZ5485-612',
      visibleText: ['AIR JORDAN 1 RETRO HIGH OG', 'DZ5485 612', '10.5'],
      identifiers: {
        upc: '00196607000000',
      },
    });

    const product = await extractProductFromImage('file:///box.jpg', 'base64');
    expect(product.brand).toBe('Nike');
    expect(product.condition).toBe('new');
    expect(product.size).toBe('US 10.5');
    expect(product.specifications?.gender).toBe("Men's");
    expect(product.specifications?.styleCode).toBe('DZ5485-612');
    expect(product.specifications?.visibleText).toContain('DZ5485 612');
    expect(product.identifiers?.upc).toBe('00196607000000');
    expect(product.identifiers?.mpn).toBe('DZ5485-612');
  });

  it('extracts condition correctly when visually supported (refurbished / used)', async () => {
    mockGeminiResponse({
      isProduct: true,
      name: 'Dell XPS 15 9530',
      brand: 'Dell',
      model: 'XPS 15 9530',
      condition: 'refurbished',
      specifications: {
        screenSize: '15.6 inch',
      },
    });

    const product = await extractProductFromImage('file:///laptop.jpg', 'base64');
    expect(product.condition).toBe('refurbished');

    mockGeminiResponse({
      isProduct: true,
      name: 'Used Nintendo Switch OLED',
      brand: 'Nintendo',
      model: 'Switch OLED',
      condition: 'used',
    });

    const usedProduct = await extractProductFromImage('file:///switch.jpg', 'base64');
    expect(usedProduct.condition).toBe('used');
  });

  it('leaves condition undefined when image has no visual indication of condition', async () => {
    mockGeminiResponse({
      isProduct: true,
      name: 'Sony WH-1000XM4',
      brand: 'Sony',
      condition: null,
    });

    const product = await extractProductFromImage('file:///photo.jpg', 'base64');
    expect(product.condition).toBeUndefined();
  });

  it('handles products with no visible brand without hallucinating', async () => {
    mockGeminiResponse({
      isProduct: true,
      name: 'Black Minimalist Running Shoes',
      brand: null,
      model: null,
      category: 'sneakers',
      color: 'Black',
      specifications: {},
      identifiers: {},
    });

    const product = await extractProductFromImage('file:///generic_shoe.jpg', 'base64');
    expect(product.name).toBe('Black Minimalist Running Shoes');
    expect(product.brand).toBeNull();
    expect(product.model).toBeNull();
    expect(product.color).toBe('Black');
    expect(product.specifications).toBeUndefined();
    expect(product.identifiers).toBeUndefined();
  });

  it('fails gracefully on blurry or unidentifiable images', async () => {
    mockGeminiResponse({
      isProduct: false,
      reason: 'Image is too blurry to identify any product.',
      name: null,
    });

    await expect(extractProductFromImage('file:///blur.jpg', 'base64')).rejects.toThrow(
      'Image is too blurry to identify any product.'
    );
  });

  it('fails gracefully on non-product images (landscape, pets, memes)', async () => {
    mockGeminiResponse({
      isProduct: false,
      reason: 'No commercial product found in image. Image appears to depict a dog in a park.',
      name: '',
    });

    await expect(extractProductFromImage('file:///dog.jpg', 'base64')).rejects.toThrow(
      'No commercial product found in image.'
    );
  });

  it('handles markdown code block responses from Gemini safely', async () => {
    const raw = '```json\n{\n  "isProduct": true,\n  "name": "Bose QuietComfort Ultra",\n  "brand": "Bose",\n  "color": "White Smoke"\n}\n```';
    mockGeminiResponse(raw);

    const product = await extractProductFromImage('file:///bose.jpg', 'base64');
    expect(product.name).toBe('Bose QuietComfort Ultra');
    expect(product.brand).toBe('Bose');
    expect(product.color).toBe('White Smoke');
  });
});