import { buildSearchQuery } from '../src/services/gemini';

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

describe('extractProductFromImage', () => {
  let extractProductFromImage: typeof import('../src/services/gemini').extractProductFromImage;

  beforeEach(() => {
    jest.resetModules();
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

  it('parses Gemini JSON into a Product', async () => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';
    extractProductFromImage = require('../src/services/gemini').extractProductFromImage;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        name: 'Sony WH-1000XM5',
                        brand: 'Sony',
                        model: 'WH-1000XM5',
                        color: 'Black',
                        category: 'headphones',
                      }),
                    },
                  ],
                },
              },
            ],
          }),
      })
    ) as jest.Mock;

    const product = await extractProductFromImage('file:///tmp.png', 'base64', 'image/png');
    expect(product).toMatchObject({
      name: 'Sony WH-1000XM5',
      brand: 'Sony',
      source: 'image',
      imageUrl: 'file:///tmp.png',
    });
    expect(product.searchQuery).toBe('Sony Sony WH-1000XM5 WH-1000XM5 Black');
  });

  it('throws when Gemini returns an empty response', async () => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';
    extractProductFromImage = require('../src/services/gemini').extractProductFromImage;
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ candidates: [] }) })
    ) as jest.Mock;
    await expect(extractProductFromImage('file:///tmp.png', 'base64')).rejects.toThrow(
      'no content'
    );
  });
});