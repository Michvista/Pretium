import {
  cleanPunctuation,
  deduplicateTokens,
  extractBroadQuery,
  isRetailerBrand,
  normalizeSpecExpressions,
  synthesizeQueries,
} from '../src/services/querySynthesis';

describe('querySynthesis utility', () => {
  describe('deduplicateTokens', () => {
    it('removes repeated tokens while preserving order', () => {
      const input = 'Sony Sony WH-1000XM5 WH-1000XM5 Black';
      expect(deduplicateTokens(input)).toBe('Sony WH-1000XM5 Black');
    });

    it('performs case-insensitive deduplication while keeping first casing', () => {
      const input = 'Nike nike AIR air Force 1';
      expect(deduplicateTokens(input)).toBe('Nike AIR Force 1');
    });

    it('handles clean strings without duplicates correctly', () => {
      const input = 'Apple iPhone 16 Pro 256GB';
      expect(deduplicateTokens(input)).toBe('Apple iPhone 16 Pro 256GB');
    });
  });

  describe('cleanPunctuation', () => {
    it('preserves alphanumeric model numbers with hyphens and slashes', () => {
      expect(cleanPunctuation('Sony WH-1000XM5')).toBe('Sony WH-1000XM5');
      expect(cleanPunctuation('Sony WH-1000XM5/S')).toBe('Sony WH-1000XM5/S');
      expect(cleanPunctuation('Samsung SM-S928B/DS')).toBe('Samsung SM-S928B/DS');
      expect(cleanPunctuation('GeForce RTX-4090')).toBe('GeForce RTX-4090');
    });

    it('removes trademark symbols and extraneous quotes', () => {
      expect(cleanPunctuation('Nike Air Force 1® "Triple White"™')).toBe(
        'Nike Air Force 1 Triple White'
      );
    });

    it('strips parenthetical/bracketed condition and carrier locks', () => {
      expect(
        cleanPunctuation('Apple iPhone 15 Pro [Renewed] (Carrier Subscription)')
      ).toBe('Apple iPhone 15 Pro');
      expect(cleanPunctuation('Google Pixel 8 [Unlocked] (128GB)')).toBe(
        'Google Pixel 8 128GB'
      );
    });

    it('strips promotional shopping boilerplate', () => {
      expect(cleanPunctuation('Sony WH-1000XM5 Buy Online Best Price Free Shipping')).toBe(
        'Sony WH-1000XM5'
      );
    });
  });

  describe('isRetailerBrand & domain sanitization', () => {
    it('identifies retailer domains and names from link extraction', () => {
      expect(isRetailerBrand('Amazon.com')).toBe(true);
      expect(isRetailerBrand('Jumia Nigeria')).toBe(true);
      expect(isRetailerBrand('Walmart.com')).toBe(true);
      expect(isRetailerBrand('Best Buy')).toBe(true);
      expect(isRetailerBrand('eBay')).toBe(true);
      expect(isRetailerBrand('aliexpress.com')).toBe(true);
      expect(isRetailerBrand('target.com')).toBe(true);
    });

    it('does not flag real manufacturer brands as retailers', () => {
      expect(isRetailerBrand('Apple')).toBe(false);
      expect(isRetailerBrand('Sony')).toBe(false);
      expect(isRetailerBrand('Nike')).toBe(false);
      expect(isRetailerBrand('Samsung')).toBe(false);
      expect(isRetailerBrand('Bose')).toBe(false);
    });
  });

  describe('normalizeSpecExpressions', () => {
    it('normalizes storage and dimensions', () => {
      expect(normalizeSpecExpressions('iPhone 15 Pro 128 GB 6.1 inch')).toBe(
        'iPhone 15 Pro 128GB 6.1-inch'
      );
    });
  });

  describe('extractBroadQuery', () => {
    it('strips color and size attributes for broad query fallback', () => {
      const strict = 'Sony WH-1000XM5 Black';
      expect(extractBroadQuery(strict)).toBe('Sony WH-1000XM5');
    });

    it('keeps short 2-3 word queries intact', () => {
      expect(extractBroadQuery('AirPods Pro 2')).toBe('AirPods Pro 2');
      expect(extractBroadQuery('Nike AF1')).toBe('Nike AF1');
    });

    it('strips shoe size for broad fallback', () => {
      const strict = 'Nike Air Force 1 Low White 10';
      expect(extractBroadQuery(strict)).toBe('Nike Air Force 1 Low');
    });
  });

  describe('synthesizeQueries integration', () => {
    it('handles the classic duplicated Gemini output: Sony Sony WH-1000XM5 WH-1000XM5 Black', () => {
      const result = synthesizeQueries({
        name: 'Sony WH-1000XM5',
        brand: 'Sony',
        model: 'WH-1000XM5',
        color: 'Black',
      });

      expect(result.strictQuery).toBe('Sony WH-1000XM5 Black');
      expect(result.broadQuery).toBe('Sony WH-1000XM5');
    });

    it('sanitizes link extraction where brand was assigned as Amazon.com', () => {
      const result = synthesizeQueries({
        name: 'Apple iPhone 15 Pro (128 GB) - Natural Titanium',
        brand: 'Amazon.com',
        searchQuery: 'Amazon.com Apple iPhone 15 Pro (128 GB) - Natural Titanium',
      });

      expect(result.strictQuery).toBe('Apple iPhone 15 Pro 128GB Natural Titanium');
      expect(result.broadQuery).toBe('Apple iPhone 15 Pro 128GB');
    });

    it('handles short/simple queries without over-pruning', () => {
      const result = synthesizeQueries({
        name: 'AirPods Pro',
        searchQuery: 'AirPods Pro',
      });

      expect(result.strictQuery).toBe('AirPods Pro');
      expect(result.broadQuery).toBe('AirPods Pro');
    });

    it('handles multi-attribute complex queries', () => {
      const result = synthesizeQueries({
        name: 'MacBook Pro',
        brand: 'Apple',
        model: 'M3 Max',
        color: 'Space Black',
        size: '16-inch',
        identifiers: { mpn: 'MUW63LL/A' },
      });

      expect(result.strictQuery).toBe(
        'Apple MacBook Pro M3 Max Space Black 16-inch MUW63LL/A'
      );
      expect(result.broadQuery).toBe('Apple MacBook Pro M3 Max 16-inch MUW63LL/A');
    });
  });
});
