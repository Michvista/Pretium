import type {
  CanonicalProduct,
  PriceResult,
  Product,
  ProductIdentifiers,
  ProductSpecifications,
  RetailerListing,
} from '../src/types';

// Mock Supabase client for data-access layer testing
const mockFrom = jest.fn();
const mockSupabaseClient = {
  from: mockFrom,
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

describe('Phase 1.5 — Data Foundation Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  describe('CanonicalProduct model construction', () => {
    it('constructs a fully populated CanonicalProduct', () => {
      const canonical: CanonicalProduct = {
        id: 'prod-uuid-001',
        name: 'Sony WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        category: 'Electronics > Audio',
        specifications: {
          color: 'Silver',
          connectivity: 'Bluetooth 5.2',
          weightGrams: 250,
          batteryLifeHours: 30,
        },
        identifiers: {
          gtin: '00027242923416',
          upc: '027242923416',
          mpn: 'WH1000XM5/S',
          sku: 'SONY-WH5-SILVER',
          asin: 'B09XS7JWHH',
        },
        condition: 'new',
        source: 'image',
        sourceUrl: null,
        searchQuery: 'Sony WH-1000XM5 Silver',
      };

      expect(canonical.id).toBe('prod-uuid-001');
      expect(canonical.name).toBe('Sony WH-1000XM5 Wireless Headphones');
      expect(canonical.brand).toBe('Sony');
      expect(canonical.model).toBe('WH-1000XM5');
      expect(canonical.category).toBe('Electronics > Audio');
      expect(canonical.condition).toBe('new');
      expect(canonical.source).toBe('image');
      expect(canonical.specifications.weightGrams).toBe(250);
      expect(canonical.identifiers.asin).toBe('B09XS7JWHH');
    });

    it('constructs a CanonicalProduct with minimal required fields and nulls', () => {
      const minimal: CanonicalProduct = {
        id: 'prod-uuid-002',
        name: 'Generic Mug',
        brand: null,
        model: null,
        category: null,
        specifications: {},
        identifiers: {},
        source: 'text',
        searchQuery: 'Generic Mug',
      };

      expect(minimal.brand).toBeNull();
      expect(minimal.model).toBeNull();
      expect(minimal.category).toBeNull();
      expect(minimal.condition).toBeUndefined();
      expect(minimal.sourceUrl).toBeUndefined();
      expect(Object.keys(minimal.specifications)).toHaveLength(0);
      expect(Object.keys(minimal.identifiers)).toHaveLength(0);
    });
  });

  describe('Product identifier handling', () => {
    it('supports standard industry identifiers (GTIN, UPC, MPN, SKU, ASIN)', () => {
      const identifiers: ProductIdentifiers = {
        gtin: '12345678901234',
        upc: '123456789012',
        mpn: 'PART-99',
        sku: 'SKU-001',
        asin: 'B00EXAMPLE',
      };

      expect(identifiers.gtin).toBe('12345678901234');
      expect(identifiers.upc).toBe('123456789012');
      expect(identifiers.mpn).toBe('PART-99');
      expect(identifiers.sku).toBe('SKU-001');
      expect(identifiers.asin).toBe('B00EXAMPLE');
    });

    it('allows partial or null identifiers', () => {
      const partial: ProductIdentifiers = {
        asin: 'B00EXAMPLE',
        gtin: null,
      };

      expect(partial.asin).toBe('B00EXAMPLE');
      expect(partial.gtin).toBeNull();
      expect(partial.upc).toBeUndefined();
    });
  });

  describe('Product specifications handling', () => {
    it('stores structured string and numeric attributes', () => {
      const specs: ProductSpecifications = {
        color: 'Space Black',
        storageGb: 256,
        ramGb: 8,
        screenInches: 6.1,
      };

      expect(specs.color).toBe('Space Black');
      expect(specs.storageGb).toBe(256);
      expect(specs.screenInches).toBe(6.1);
    });
  });

  describe('RetailerListing & PriceResult representation', () => {
    it('constructs a RetailerListing with all required fields', () => {
      const listing: RetailerListing = {
        storeName: 'Amazon',
        productUrl: 'https://amazon.com/dp/B09XS7JWHH',
        inStock: true,
        rawTitle: 'Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones - Silver',
        title: 'Sony WH-1000XM5 Wireless Headphones',
        listingImageUrl: 'https://images.example.com/sony.jpg',
        imageUrl: 'https://images.example.com/sony.jpg',
        price: 349.99,
        currency: 'USD',
        shippingCost: 0,
        totalCost: 349.99,
        rating: 4.6,
        ratingCount: 8520,
        matchConfidence: null,
      };

      expect(listing.storeName).toBe('Amazon');
      expect(listing.price).toBe(349.99);
      expect(listing.shippingCost).toBe(0);
      expect(listing.totalCost).toBe(349.99);
      expect(listing.rawTitle).toBe(
        'Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones - Silver'
      );
      expect(listing.title).toBe('Sony WH-1000XM5 Wireless Headphones');
      expect(listing.listingImageUrl).toBe('https://images.example.com/sony.jpg');
      expect(listing.imageUrl).toBe('https://images.example.com/sony.jpg');
      expect(listing.matchConfidence).toBeNull();
    });

    it('PriceResult is assignable to RetailerListing without type errors', () => {
      const priceResult: PriceResult = {
        storeName: 'Best Buy',
        price: 349.99,
        currency: 'USD',
        shippingCost: null,
        totalCost: 349.99,
        productUrl: 'https://bestbuy.com/site/12345.p',
        inStock: true,
        title: 'Sony Headphones',
      };

      const listing: RetailerListing = priceResult;
      expect(listing.storeName).toBe('Best Buy');
      expect(listing.totalCost).toBe(349.99);
    });
  });

  describe('Legacy Product backwards compatibility', () => {
    it('preserves backwards compatibility for existing Product captures', () => {
      const legacyProduct: Product = {
        name: 'Nike Air Force 1',
        brand: 'Nike',
        model: 'AF1',
        color: 'White',
        size: '10',
        category: 'Sneakers',
        description: 'Classic leather sneaker',
        imageUrl: 'file:///local/image.jpg',
        price: 110,
        currency: 'USD',
        source: 'image',
        sourceUrl: null,
        searchQuery: 'Nike Air Force 1 White 10',
      };

      expect(legacyProduct.name).toBe('Nike Air Force 1');
      expect(legacyProduct.source).toBe('image');
      expect(legacyProduct.color).toBe('White');
    });

    it('allows newly defined structured fields on Product', () => {
      const enhancedProduct: Product = {
        name: 'Nike Air Force 1',
        source: 'text',
        searchQuery: 'Nike Air Force 1',
        specifications: { color: 'White', size: '10' },
        identifiers: { upc: '012345678901' },
        condition: 'new',
      };

      expect(enhancedProduct.specifications?.color).toBe('White');
      expect(enhancedProduct.identifiers?.upc).toBe('012345678901');
      expect(enhancedProduct.condition).toBe('new');
    });
  });

  describe('Supabase Data-Access Layer serialization/deserialization', () => {
    let supabaseService: typeof import('../src/services/supabase');

    beforeEach(() => {
      jest.isolateModules(() => {
        supabaseService = require('../src/services/supabase');
      });
    });

    it('savePriceHistory persists all snapshot fields', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ insert: insertMock });

      const testListings: PriceResult[] = [
        {
          storeName: 'Target',
          price: 99.99,
          currency: 'USD',
          shippingCost: 5.99,
          totalCost: 105.98,
          productUrl: 'https://target.com/item/1',
          inStock: true,
          rawTitle: 'Target Raw Title',
          title: 'Target Title',
          matchConfidence: null,
        },
      ];

      await supabaseService.savePriceHistory('hash-123', testListings);

      expect(mockFrom).toHaveBeenCalledWith('price_history');
      expect(insertMock).toHaveBeenCalledWith([
        {
          product_hash: 'hash-123',
          store_name: 'Target',
          price: 99.99,
          currency: 'USD',
          shipping_cost: 5.99,
          total_cost: 105.98,
          product_url: 'https://target.com/item/1',
          raw_title: 'Target Raw Title',
          match_confidence: null,
        },
      ]);
    });

    it('getPriceHistory deserializes snapshot records into PriceResult objects', async () => {
      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();
      const orderMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockResolvedValue({
        data: [
          {
            store_name: 'Walmart',
            price: '89.50',
            currency: 'USD',
            shipping_cost: '0.00',
            total_cost: '89.50',
            product_url: 'https://walmart.com/ip/1',
            raw_title: 'Walmart Raw Title',
            match_confidence: null,
          },
        ],
        error: null,
      });

      mockFrom.mockReturnValue({
        select: selectMock,
        eq: eqMock,
        order: orderMock,
        limit: limitMock,
      });

      // Chain mocks
      selectMock.mockReturnValue({ eq: eqMock });
      eqMock.mockReturnValue({ order: orderMock });
      orderMock.mockReturnValue({ limit: limitMock });

      const history = await supabaseService.getPriceHistory('hash-123');

      expect(mockFrom).toHaveBeenCalledWith('price_history');
      expect(history).toHaveLength(1);
      expect(history[0].storeName).toBe('Walmart');
      expect(history[0].price).toBe(89.5);
      expect(history[0].shippingCost).toBe(0);
      expect(history[0].totalCost).toBe(89.5);
      expect(history[0].rawTitle).toBe('Walmart Raw Title');
      expect(history[0].title).toBe('Walmart Raw Title');
    });

    it('getCachedResults deserializes both legacy and modern cache objects safely', async () => {
      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();
      const gtMock = jest.fn().mockReturnThis();
      const maybeSingleMock = jest.fn().mockResolvedValue({
        data: {
          results: [
            // Legacy row (only title and imageUrl)
            {
              storeName: 'Legacy Store',
              price: 50,
              currency: 'USD',
              shippingCost: null,
              totalCost: 50,
              productUrl: 'https://store.com',
              inStock: true,
              title: 'Legacy Title',
              imageUrl: 'https://store.com/img.jpg',
            },
            // Modern row (with rawTitle and listingImageUrl)
            {
              storeName: 'Modern Store',
              price: 45,
              currency: 'USD',
              shippingCost: 0,
              totalCost: 45,
              productUrl: 'https://modern.com',
              inStock: true,
              rawTitle: 'Modern Raw Title',
              listingImageUrl: 'https://modern.com/img.jpg',
            },
          ],
        },
        error: null,
      });

      mockFrom.mockReturnValue({
        select: selectMock,
      });
      selectMock.mockReturnValue({ eq: eqMock });
      eqMock.mockReturnValue({ gt: gtMock });
      gtMock.mockReturnValue({ maybeSingle: maybeSingleMock });

      const results = await supabaseService.getCachedResults('query-hash');

      expect(results).toHaveLength(2);
      // Legacy normalization
      expect(results![0].rawTitle).toBe('Legacy Title');
      expect(results![0].title).toBe('Legacy Title');
      expect(results![0].listingImageUrl).toBe('https://store.com/img.jpg');
      expect(results![0].imageUrl).toBe('https://store.com/img.jpg');

      // Modern normalization
      expect(results![1].rawTitle).toBe('Modern Raw Title');
      expect(results![1].title).toBe('Modern Raw Title');
      expect(results![1].listingImageUrl).toBe('https://modern.com/img.jpg');
      expect(results![1].imageUrl).toBe('https://modern.com/img.jpg');
    });

    it('saveCanonicalProduct and getCanonicalProductByHash serialize/deserialize correctly', async () => {
      const upsertMock = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: upsertMock });

      const product: CanonicalProduct = {
        id: 'cp-123',
        name: 'MacBook Pro 16',
        brand: 'Apple',
        model: 'M3 Pro',
        category: 'Computers > Laptops',
        specifications: { ramGb: 36, ssdGb: 512 },
        identifiers: { upc: '195949000000' },
        condition: 'new',
        source: 'text',
        sourceUrl: null,
        searchQuery: 'MacBook Pro 16 M3 Pro',
      };

      await supabaseService.saveCanonicalProduct('macbook-hash', product);

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          product_hash: 'macbook-hash',
          name: 'MacBook Pro 16',
          brand: 'Apple',
          model: 'M3 Pro',
          specifications: { ramGb: 36, ssdGb: 512 },
          identifiers: { upc: '195949000000' },
        }),
        { onConflict: 'product_hash' }
      );

      // Test retrieval
      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();
      const maybeSingleMock = jest.fn().mockResolvedValue({
        data: {
          id: 'cp-123',
          name: 'MacBook Pro 16',
          brand: 'Apple',
          model: 'M3 Pro',
          category: 'Computers > Laptops',
          specifications: { ramGb: 36, ssdGb: 512 },
          identifiers: { upc: '195949000000' },
          condition: 'new',
          source: 'text',
          source_url: null,
          search_query: 'MacBook Pro 16 M3 Pro',
        },
        error: null,
      });

      mockFrom.mockReturnValue({ select: selectMock });
      selectMock.mockReturnValue({ eq: eqMock });
      eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });

      const retrieved = await supabaseService.getCanonicalProductByHash('macbook-hash');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('MacBook Pro 16');
      expect(retrieved?.specifications.ramGb).toBe(36);
      expect(retrieved?.identifiers.upc).toBe('195949000000');
    });

    it('addToWatchlist persists currency and image_url safely', async () => {
      const upsertMock = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: upsertMock });

      await supabaseService.addToWatchlist('user-1', {
        user_id: 'user-1',
        product_name: 'Camera',
        product_hash: 'camera-hash',
        target_price: 500,
        current_price: 600,
        currency: 'EUR',
        image_url: 'https://example.com/cam.jpg',
      });

      expect(mockFrom).toHaveBeenCalledWith('watchlist');
      expect(upsertMock).toHaveBeenCalledWith(
        {
          user_id: 'user-1',
          product_name: 'Camera',
          product_hash: 'camera-hash',
          target_price: 500,
          current_price: 600,
          currency: 'EUR',
          image_url: 'https://example.com/cam.jpg',
        },
        { onConflict: 'user_id,product_hash' }
      );
    });
  });
});
