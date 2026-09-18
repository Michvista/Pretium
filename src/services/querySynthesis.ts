import type { CanonicalProduct, Product } from '@/types';

export interface SynthesizedQueries {
  /** High-precision query combining brand, clean model/name, and key specifications. */
  strictQuery: string;
  /** Broader fallback query retaining only brand and core product name/model. */
  broadQuery: string;
}

export type QueryInput =
  | Product
  | CanonicalProduct
  | {
      name?: string;
      brand?: string | null;
      model?: string | null;
      color?: string | null;
      size?: string | null;
      searchQuery?: string | null;
      specifications?: Record<string, string | number> | null;
      identifiers?: {
        gtin?: string | null;
        upc?: string | null;
        mpn?: string | null;
        sku?: string | null;
        asin?: string | null;
      } | null;
    };

// Known retailer domain names and marketplaces to strip from queries
const RETAILER_DOMAIN_REGEX =
  /\b(?:https?:\/\/)?(?:www\.)?(?:amazon(?:\.[a-z]{2,3})+|jumia(?:\.[a-z]{2,3})+|walmart(?:\.[a-z]{2,3})+|bestbuy(?:\.[a-z]{2,3})+|ebay(?:\.[a-z]{2,3})+|aliexpress(?:\.[a-z]{2,3})+|target\.com)\b/gi;

const RETAILER_NAME_PREFIX_REGEX =
  /^(?:amazon(?:\.com|\.co\.[a-z]{2}|\.[a-z]{2,3})*|jumia(?:\s+nigeria|\s+ghana|\s+kenya|\.[a-z]{2,3})*|walmart(?:\.com)*|best\s*buy|ebay(?:\.com)*|target)\s*[:\-–—|]?\s*/i;

// Marketing boilerplate words and shopping promotional phrases
const BOILERPLATE_REGEX =
  /\b(?:buy\s+online|best\s+price|on\s+sale|free\s+shipping|hot\s+deal|free\s+delivery|order\s+now|official\s+store)\b/gi;

// Parenthetical/bracketed packaging, carrier lock, or condition markers
const NOISY_BRACKET_REGEX =
  /[\[(]\s*(?:renewed|refurbished|locked|unlocked|carrier\s+subscription|pack\s+of\s+\d+|latest\s+model|\d{4}\s+model|\d{4}\s+release)\s*[\])]/gi;

/**
 * Checks if a string is a known retailer name or domain (e.g. from OpenGraph og:site_name).
 */
export function isRetailerBrand(brand?: string | null): boolean {
  if (!brand) return false;
  const normalized = brand.trim().toLowerCase();
  return (
    normalized.includes('amazon') ||
    normalized.includes('jumia') ||
    normalized.includes('walmart') ||
    normalized.includes('best buy') ||
    normalized.includes('bestbuy') ||
    normalized.includes('ebay') ||
    normalized.includes('aliexpress') ||
    normalized.includes('target') ||
    normalized.endsWith('.com') ||
    normalized.endsWith('.ng') ||
    normalized.endsWith('.org')
  );
}

/**
 * Normalizes packaging and spec expressions like "( 128 GB )" -> "128GB".
 */
export function normalizeSpecExpressions(text: string): string {
  return text
    .replace(/(\d+)\s*(gb|tb|mb|ghz|mhz|mah|w)\b/gi, '$1$2')
    .replace(/(\d+)\s*(inch(?:es)?|["'”])\b/gi, '$1-inch');
}

/**
 * Removes extraneous punctuation while strictly protecting alphanumeric
 * model identifiers (such as WH-1000XM5, SM-S928B/DS, RTX 4090, M3 Pro).
 */
export function cleanPunctuation(text: string): string {
  return text
    .replace(NOISY_BRACKET_REGEX, ' ')
    .replace(RETAILER_DOMAIN_REGEX, ' ')
    .replace(RETAILER_NAME_PREFIX_REGEX, ' ')
    .replace(BOILERPLATE_REGEX, ' ')
    .replace(/[®™©]/g, '') // remove trademark symbols
    .replace(/["'”]/g, '') // remove quotes
    .replace(/[[\]{}()]/g, ' ') // remove brackets
    .replace(/[,;|•·]/g, ' ') // replace list delimiters with spaces
    .replace(/\s+[-–—]+\s+/g, ' ') // replace isolated dashes with space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicates tokens in a string while preserving token appearance order
 * and the original casing of the first occurrence.
 */
export function deduplicateTokens(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const token of tokens) {
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(token);
    }
  }

  return deduped.join(' ');
}

/**
 * Strips attribute noise from a query to create a broad fallback search query.
 * Removes secondary attributes like color names, sizes, or storage capacities.
 */
export function extractBroadQuery(strictQuery: string, brand?: string | null): string {
  const tokens = strictQuery.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) {
    return strictQuery;
  }

  // Common color terms to remove in broad fallback
  const COLOR_TOKENS = new Set([
    'black',
    'white',
    'silver',
    'grey',
    'gray',
    'gold',
    'blue',
    'navy',
    'red',
    'green',
    'purple',
    'pink',
    'yellow',
    'orange',
    'titanium',
    'natural',
    'midnight',
    'starlight',
    'space',
    'rose',
  ]);

  const isSizeToken = (token: string, isLastToken: boolean): boolean => {
    const lower = token.toLowerCase();
    // Standard clothing sizes
    if (/^(?:xs|s|m|l|xl|xxl|xxxl)$/i.test(lower)) return true;
    // Explicit prefixed sizes: us10, uk9, eu42, sz10
    if (/^(?:us|uk|eu|sz|size)\d+(\.\d+)?$/i.test(lower)) return true;
    // Decimal shoe sizes: e.g. 10.5, 9.5
    if (/^\d{1,2}\.5$/i.test(lower)) return true;
    // Tail integer shoe size (e.g. US 6-16 or EU 35-48)
    if (isLastToken) {
      const num = Number(lower);
      if (!isNaN(num) && ((num >= 6 && num <= 16) || (num >= 35 && num <= 48))) {
        return true;
      }
    }
    return false;
  };

  const broadTokens = tokens.filter((t, index) => {
    // Always keep the first 2 tokens (typically Brand + Model/Core Name)
    if (index < 2) return true;
    const lower = t.toLowerCase();
    if (COLOR_TOKENS.has(lower)) return false;
    if (isSizeToken(t, index === tokens.length - 1)) return false;
    return true;
  });

  // Ensure broad query retains at least 2 tokens
  if (broadTokens.length < 2) {
    return tokens.slice(0, Math.min(tokens.length, 2)).join(' ');
  }

  return broadTokens.join(' ');
}

/**
 * Synthesizes search queries for a product, generating both a high-precision
 * strict query and a broad fallback query.
 */
export function synthesizeQueries(input: QueryInput): SynthesizedQueries {
  const rawBrand = input.brand?.trim() || null;
  const brand = isRetailerBrand(rawBrand) ? null : rawBrand;

  let rawName = input.name?.trim() || '';
  if (input.searchQuery?.trim() && !rawName) {
    rawName = input.searchQuery.trim();
  }

  rawName = cleanPunctuation(rawName);

  const model = input.model?.trim() || null;
  const color =
    ('color' in input && typeof input.color === 'string' ? input.color.trim() : null) ||
    ('specifications' in input &&
    input.specifications &&
    typeof input.specifications.color === 'string'
      ? input.specifications.color.trim()
      : null) ||
    null;

  const size =
    ('size' in input && typeof input.size === 'string' ? input.size.trim() : null) ||
    ('specifications' in input &&
    input.specifications &&
    input.specifications.size != null
      ? String(input.specifications.size).trim()
      : null) ||
    null;

  // Avoid prepending brand or model if already present in name
  const brandToAdd = brand && !rawName.toLowerCase().includes(brand.toLowerCase()) ? brand : null;
  const modelToAdd = model && !rawName.toLowerCase().includes(model.toLowerCase()) ? model : null;

  // Include MPN if available and not already in name
  const extraParts: string[] = [];
  if (input.identifiers?.mpn && !rawName.toLowerCase().includes(input.identifiers.mpn.toLowerCase())) {
    extraParts.push(input.identifiers.mpn);
  }

  const parts = [brandToAdd, rawName, modelToAdd, color, size, ...extraParts]
    .filter(Boolean)
    .map((p) => normalizeSpecExpressions(p as string));

  const assembled = parts.join(' ');
  const cleaned = cleanPunctuation(assembled);
  const strictQuery = deduplicateTokens(cleaned);

  const broadQuery = extractBroadQuery(strictQuery, brand);

  return {
    strictQuery: strictQuery || rawName || 'product',
    broadQuery: broadQuery || strictQuery || rawName || 'product',
  };
}
