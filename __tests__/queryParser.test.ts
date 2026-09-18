import { parseQueryToProduct, parseTextQuery } from '../src/services/queryParser';

describe('queryParser service (Phase 3.4)', () => {
  describe('Prompt Target Queries', () => {
    it('parses "Nike Air Force 1 07 white size 10"', () => {
      const result = parseTextQuery('Nike Air Force 1 07 white size 10');

      expect(result.originalQuery).toBe('Nike Air Force 1 07 white size 10');
      expect(result.brand).toBe('Nike');
      expect(result.series).toBe('Air Force 1');
      expect(result.edition).toBe('07');
      expect(result.color).toBe('white');
      expect(result.size).toBe('size 10');
      expect(result.specifications.color).toBe('white');
      expect(result.specifications.size).toBe('size 10');
      expect(result.specifications.edition).toBe('07');
      expect(result.storage).toBeNull();
      expect(result.ram).toBeNull();
    });

    it('parses "iPhone 16 Pro 256GB Space Black"', () => {
      const result = parseTextQuery('iPhone 16 Pro 256GB Space Black');

      expect(result.originalQuery).toBe('iPhone 16 Pro 256GB Space Black');
      expect(result.brand).toBeNull(); // Apple not explicitly in query
      expect(result.series).toBe('iPhone');
      expect(result.model).toContain('16 Pro');
      expect(result.storage).toBe('256GB');
      expect(result.color).toBe('Space Black');
      // Verify raw extraction without normalization
      expect(result.storage).not.toBe('256 GB');
      expect(result.color).not.toBe('Black');
      expect(result.specifications.storage).toBe('256GB');
      expect(result.specifications.color).toBe('Space Black');
    });

    it('parses "Sony WH-1000XM5 black"', () => {
      const result = parseTextQuery('Sony WH-1000XM5 black');

      expect(result.originalQuery).toBe('Sony WH-1000XM5 black');
      expect(result.brand).toBe('Sony');
      expect(result.modelNumber).toBe('WH-1000XM5');
      expect(result.identifiers?.mpn).toBe('WH-1000XM5');
      expect(result.color).toBe('black');
      expect(result.specifications.color).toBe('black');
      expect(result.specifications.modelNumber).toBe('WH-1000XM5');
    });

    it('parses "Samsung Galaxy S25 Ultra 512GB"', () => {
      const result = parseTextQuery('Samsung Galaxy S25 Ultra 512GB');

      expect(result.originalQuery).toBe('Samsung Galaxy S25 Ultra 512GB');
      expect(result.brand).toBe('Samsung');
      expect(result.series).toBe('Galaxy S');
      expect(result.model).toContain('Galaxy S25 Ultra');
      expect(result.storage).toBe('512GB');
      expect(result.specifications.storage).toBe('512GB');
      expect(result.color).toBeNull();
    });

    it('parses "Adidas Samba OG US 10"', () => {
      const result = parseTextQuery('Adidas Samba OG US 10');

      expect(result.originalQuery).toBe('Adidas Samba OG US 10');
      expect(result.brand).toBe('Adidas');
      expect(result.series).toBe('Samba');
      expect(result.edition).toBe('OG');
      expect(result.size).toBe('US 10');
      expect(result.specifications.size).toBe('US 10');
      expect(result.specifications.edition).toBe('OG');
    });
  });

  describe('Electronics Queries', () => {
    it('parses laptop query with RAM, storage, and Apple brand', () => {
      const result = parseTextQuery(
        'Apple MacBook Pro 16 M3 Max 36GB 1TB Space Black'
      );

      expect(result.brand).toBe('Apple');
      expect(result.series).toBe('MacBook Pro');
      expect(result.ram).toBe('36GB');
      expect(result.storage).toBe('1TB');
      expect(result.color).toBe('Space Black');
      expect(result.specifications.ram).toBe('36GB');
      expect(result.specifications.storage).toBe('1TB');
    });

    it('parses Dell XPS query with explicit SSD and RAM tokens', () => {
      const result = parseTextQuery('Dell XPS 15 9530 32GB RAM 1TB SSD');

      expect(result.brand).toBe('Dell');
      expect(result.series).toBe('XPS');
      expect(result.ram).toBe('32GB');
      expect(result.storage).toBe('1TB');
      expect(result.model).toContain('9530');
    });

    it('parses graphics card with RTX model number', () => {
      const result = parseTextQuery('Asus ROG Strix RTX 4090 24GB');

      expect(result.brand).toBe('Asus');
      expect(result.series).toBe('ROG');
      expect(result.modelNumber).toBe('RTX 4090');
      expect(result.storage).toBe('24GB');
    });

    it('parses Bose audio with multi-word colorway', () => {
      const result = parseTextQuery('Bose QuietComfort Ultra White Smoke');

      expect(result.brand).toBe('Bose');
      expect(result.series).toBe('QuietComfort');
      expect(result.color).toBe('White Smoke');
    });
  });

  describe('Footwear & Sneaker Queries', () => {
    it('extracts shoe style code and assigns to identifiers.mpn', () => {
      const result = parseTextQuery('Nike Dunk Low Retro Panda DD1391-100');

      expect(result.brand).toBe('Nike');
      expect(result.series).toBe('Dunk Low');
      expect(result.edition).toBe('Retro');
      expect(result.color).toBe('Panda');
      expect(result.styleCode).toBe('DD1391-100');
      expect(result.identifiers?.mpn).toBe('DD1391-100');
    });

    it('extracts decimal shoe sizes and colorway', () => {
      const result = parseTextQuery('Jordan 4 Retro Bred size 10.5');

      expect(result.brand).toBe('Jordan');
      expect(result.edition).toBe('Retro');
      expect(result.color).toBe('Bred');
      expect(result.size).toBe('size 10.5');
    });

    it('extracts explicit gender and iconic Triple White colorway', () => {
      const result = parseTextQuery("Women's Nike Air Max 90 Triple White");

      expect(result.brand).toBe('Nike');
      expect(result.series).toBe('Air Max');
      expect(result.gender).toBe("Women's");
      expect(result.color).toBe('Triple White');
    });
  });

  describe('Apparel Queries', () => {
    it('extracts waist x inseam dimensions for jeans', () => {
      const result = parseTextQuery("Men's Levi's 501 Original Fit Jeans 32x32 Blue");

      expect(result.brand).toBe("Levi's");
      expect(result.gender).toBe("Men's");
      expect(result.size).toBe('32x32');
      expect(result.color).toBe('Blue');
    });

    it('extracts unisex gender and letter size', () => {
      const result = parseTextQuery('Unisex oversized black hoodie size XL');

      expect(result.brand).toBeNull();
      expect(result.gender).toBe('Unisex');
      expect(result.color).toBe('black');
      expect(result.size).toBe('size XL');
    });
  });

  describe('Ambiguity & Non-Hallucination', () => {
    it('leaves brand and specs null when query is generic or ambiguous', () => {
      const result = parseTextQuery('black low top sneakers');

      expect(result.brand).toBeNull();
      expect(result.series).toBeNull();
      expect(result.color).toBe('black');
      expect(result.size).toBeNull();
      expect(result.storage).toBeNull();
      expect(result.ram).toBeNull();
      expect(result.identifiers).toBeUndefined();
    });

    it('handles empty or whitespace query safely', () => {
      const result = parseTextQuery('   ');

      expect(result.originalQuery).toBe('   ');
      expect(result.name).toBe('');
      expect(result.brand).toBeNull();
      expect(result.model).toBeNull();
    });
  });

  describe('Extraction vs Normalization Rules', () => {
    it('strictly preserves literal raw values without unit or color conversion', () => {
      const result = parseTextQuery('iPhone 15 Pro 128GB Triple Black');

      expect(result.storage).toBe('128GB');
      expect(result.storage).not.toBe('128 GB');
      expect(result.storage).not.toBe(128);

      expect(result.color).toBe('Triple Black');
      expect(result.color).not.toBe('Black');
    });
  });

  describe('parseQueryToProduct Helper', () => {
    it('constructs an application-compatible Product model from search text', () => {
      const product = parseQueryToProduct('Sony WH-1000XM5 black');

      expect(product.name).toContain('Sony');
      expect(product.brand).toBe('Sony');
      expect(product.color).toBe('black');
      expect(product.source).toBe('text');
      expect(product.searchQuery).toBe('Sony WH-1000XM5 black');
      expect(product.identifiers?.mpn).toBe('WH-1000XM5');
      expect(product.specifications?.modelNumber).toBe('WH-1000XM5');
    });
  });
});
