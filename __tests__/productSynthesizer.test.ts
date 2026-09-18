import {
  canonicalToProduct,
  generateCanonicalId,
  isCanonicalProduct,
  synthesizeCanonicalProduct,
  synthesizeFromImageProduct,
  synthesizeFromLinkProduct,
  synthesizeFromParsedQuery,
  synthesizeFromTextProduct,
} from '../src/services/productSynthesizer';
import type { ExtractedProductData } from '../src/services/linkExtractor';
import type { CanonicalProduct, Product } from '../src/types';

describe('productSynthesizer service (Phase 3.5)', () => {
  describe('Image Channel Synthesis', () => {
    it('maps Gemini image output into CanonicalProduct with provenance and specs', () => {
      const imageProduct: Product = {
        id: 'img-123',
        name: 'Sony WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        category: 'headphones',
        color: 'Black',
        description: 'Noise canceling headphones',
        imageUrl: 'file:///local/headphones.jpg',
        condition: 'new',
        source: 'image',
        searchQuery: 'Sony WH-1000XM5 Wireless Headphones Black',
        specifications: {
          batteryLife: '30 hours',
          series: '1000X',
        },
        identifiers: {
          mpn: 'WH1000XM5/B',
        },
      };

      const canonical = synthesizeFromImageProduct(imageProduct);

      expect(canonical.id).toBe('img-123');
      expect(canonical.name).toBe('Sony WH-1000XM5 Wireless Headphones');
      expect(canonical.brand).toBe('Sony');
      expect(canonical.model).toBe('WH-1000XM5');
      expect(canonical.category).toBe('headphones');
      expect(canonical.condition).toBe('new');
      expect(canonical.source).toBe('image');
      expect(canonical.sourceUrl).toBe('file:///local/headphones.jpg');
      expect(canonical.specifications.batteryLife).toBe('30 hours');
      expect(canonical.specifications.color).toBe('Black');
      expect(canonical.identifiers.mpn).toBe('WH1000XM5/B');
      expect(canonical.searchQuery).toBe('Sony WH-1000XM5 Wireless Headphones Black');
    });

    it('generates a new unique id if product id is missing', () => {
      const imageProduct: Product = {
        name: 'Generic Mug',
        source: 'image',
        searchQuery: 'Generic Mug',
      };

      const canonical = synthesizeCanonicalProduct(imageProduct);
      expect(canonical.id).toBeDefined();
      expect(typeof canonical.id).toBe('string');
      expect(canonical.id.length).toBeGreaterThan(5);
    });
  });

  describe('URL Channel Synthesis', () => {
    it('maps URL extraction output into CanonicalProduct with literal specs and identifiers', () => {
      const linkProduct: ExtractedProductData = {
        name: 'Apple MacBook Pro 16"',
        brand: 'Apple',
        model: 'MacBook Pro 16',
        category: 'Computers > Laptops',
        description: 'M3 Max chip with 36GB RAM, 1 TB storage',
        price: 3499.0,
        currency: 'USD',
        availability: 'InStock',
        source: 'link',
        sourceUrl: 'https://www.amazon.com/dp/B0CM59X76H',
        searchQuery: 'Apple MacBook Pro 16',
        specifications: {
          storage: '1 TB',
          ram: '36GB',
          processor: 'M3 Max',
        },
        identifiers: {
          asin: 'B0CM59X76H',
          sku: 'MUW63LL/A',
        },
      };

      const canonical = synthesizeFromLinkProduct(linkProduct);

      expect(canonical.name).toBe('Apple MacBook Pro 16"');
      expect(canonical.brand).toBe('Apple');
      expect(canonical.source).toBe('link');
      expect(canonical.sourceUrl).toBe('https://www.amazon.com/dp/B0CM59X76H');
      expect(canonical.identifiers.asin).toBe('B0CM59X76H');
      expect(canonical.identifiers.sku).toBe('MUW63LL/A');
      // Crucial: Raw extraction preserved without unit normalization
      expect(canonical.specifications.storage).toBe('1 TB');
      expect(canonical.specifications.storage).not.toBe('1024 GB');
      expect(canonical.specifications.ram).toBe('36GB');
      expect(canonical.specifications.availability).toBe('InStock');
    });
  });

  describe('Text Channel Synthesis', () => {
    it('synthesizes CanonicalProduct from free-form search query string', () => {
      const canonical = synthesizeCanonicalProduct(
        'Nike Air Force 1 07 white size 10'
      );

      expect(canonical.brand).toBe('Nike');
      expect(canonical.model).toContain('Air Force 1');
      expect(canonical.source).toBe('text');
      expect(canonical.sourceUrl).toBeNull();
      expect(canonical.specifications.color).toBe('white');
      expect(canonical.specifications.size).toBe('size 10');
      expect(canonical.specifications.edition).toBe('07');
      expect(canonical.searchQuery).toBe('Nike Air Force 1 07 white size 10');
    });

    it('synthesizes CanonicalProduct from ParsedQuery object with unnormalized color', () => {
      const canonical = synthesizeCanonicalProduct('iPhone 16 Pro 256GB Triple Black');

      expect(canonical.source).toBe('text');
      expect((canonical as any).storage).toBeUndefined(); // on CanonicalProduct, storage is in specifications
      expect(canonical.specifications.storage).toBe('256GB');
      expect(canonical.specifications.color).toBe('Triple Black');
      // Verify no color canonicalization to "Black"
      expect(canonical.specifications.color).not.toBe('Black');
    });
  });

  describe('Search Query Deduplication', () => {
    it('removes accidental duplicate query tokens while preserving model numbers', () => {
      const product: Product = {
        name: 'Sony WH-1000XM5',
        brand: 'Sony',
        model: 'WH-1000XM5',
        color: 'Black',
        source: 'text',
        searchQuery: 'Sony Sony WH-1000XM5 WH-1000XM5 Black Black',
        specifications: { color: 'Black' },
      };

      const canonical = synthesizeCanonicalProduct(product);
      expect(canonical.searchQuery).toBe('Sony WH-1000XM5 Black');
    });
  });

  describe('Type Guard and Bi-directional Compatibility', () => {
    it('correctly validates a CanonicalProduct structure via isCanonicalProduct', () => {
      const canonical: CanonicalProduct = {
        id: 'prod-001',
        name: 'Test Product',
        brand: 'Test Brand',
        model: 'M1',
        category: 'Electronics',
        specifications: { key: 'val' },
        identifiers: { upc: '123456789012' },
        source: 'text',
        sourceUrl: null,
        searchQuery: 'Test Product M1',
      };

      expect(isCanonicalProduct(canonical)).toBe(true);
      expect(isCanonicalProduct({ name: 'Incomplete' })).toBe(false);
      expect(isCanonicalProduct(null)).toBe(false);
    });

    it('converts CanonicalProduct back into a UI-compatible Product model', () => {
      const canonical: CanonicalProduct = {
        id: 'prod-002',
        name: 'Air Jordan 4 Retro',
        brand: 'Jordan',
        model: 'Air Jordan 4',
        category: 'Sneakers',
        specifications: { color: 'Bred', size: 'US 10.5' },
        identifiers: { mpn: '308497-060' },
        condition: 'new',
        source: 'image',
        sourceUrl: 'file:///box.jpg',
        searchQuery: 'Jordan Air Jordan 4 Bred US 10.5',
      };

      const product = canonicalToProduct(canonical, { imageUrl: 'file:///box.jpg' });

      expect(product.id).toBe('prod-002');
      expect(product.name).toBe('Air Jordan 4 Retro');
      expect(product.brand).toBe('Jordan');
      expect(product.color).toBe('Bred');
      expect(product.size).toBe('US 10.5');
      expect(product.imageUrl).toBe('file:///box.jpg');
      expect(product.source).toBe('image');
      expect(product.identifiers?.mpn).toBe('308497-060');
    });
  });
});
