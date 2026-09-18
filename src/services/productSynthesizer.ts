import type { ExtractedProductData } from '@/services/linkExtractor';
import { parseTextQuery, type ParsedQuery } from '@/services/queryParser';
import { synthesizeQueries } from '@/services/querySynthesis';
import type {
  CanonicalProduct,
  Product,
  ProductCondition,
  ProductIdentifiers,
  ProductSource,
  ProductSpecifications,
} from '@/types';

/**
 * Generates a unique identifier for a canonical product across environments.
 */
export function generateCanonicalId(): string {
  try {
    const nodeCrypto = require('crypto');
    if (typeof nodeCrypto?.randomUUID === 'function') {
      return nodeCrypto.randomUUID();
    }
  } catch {
    // Fallback for non-Node environments
  }
  return 'cp_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export interface SynthesisOptions {
  /** Explicit override for product ID. */
  id?: string;
  /** Explicit source override if not present on input. */
  source?: ProductSource;
  /** Explicit source URL override. */
  sourceUrl?: string | null;
}

/**
 * Type guard checking if an object is already a CanonicalProduct.
 */
export function isCanonicalProduct(obj: any): obj is CanonicalProduct {
  return Boolean(
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.searchQuery === 'string' &&
    typeof obj.specifications === 'object' &&
    typeof obj.identifiers === 'object' &&
    (obj.source === 'text' || obj.source === 'image' || obj.source === 'link')
  );
}

/**
 * Centralized product representation synthesizer.
 * Unifies inputs from Gemini Vision (image), Link Extractor (URL), and Query Parser (text)
 * into the Phase 1 CanonicalProduct model.
 *
 * Enforces Phase 3 boundaries:
 * - Pure structuring and mapping (no normalization, no unit conversion, no color canonicalization).
 * - Generates clean, retrieval-ready search queries with deduplicated tokens.
 * - Preserves provenance, identifiers, and exact raw extracted specifications.
 */
export function synthesizeCanonicalProduct(
  input: Product | ExtractedProductData | ParsedQuery | string,
  options: SynthesisOptions = {}
): CanonicalProduct {
  // If a raw string is passed, parse it as text query
  if (typeof input === 'string') {
    const parsed = parseTextQuery(input);
    return synthesizeFromParsedQuery(parsed, options);
  }

  // If a ParsedQuery object is passed directly
  if ('originalQuery' in input && !('searchQuery' in input)) {
    return synthesizeFromParsedQuery(input as ParsedQuery, options);
  }

  // Handle Product / ExtractedProductData
  const product = input as Product | ExtractedProductData;
  const source: ProductSource = options.source || product.source || 'text';

  switch (source) {
    case 'image':
      return synthesizeFromImageProduct(product, options);
    case 'link':
      return synthesizeFromLinkProduct(product as ExtractedProductData, options);
    case 'text':
    default:
      return synthesizeFromTextProduct(product, options);
  }
}

/**
 * Synthesizes a CanonicalProduct from a Gemini Vision image extraction result.
 */
export function synthesizeFromImageProduct(
  product: Product,
  options: SynthesisOptions = {}
): CanonicalProduct {
  const id = options.id || product.id || generateCanonicalId();
  const name = (product.name || 'Identified Product').trim();
  const brand = product.brand?.trim() || null;
  const model = product.model?.trim() || null;
  const category = product.category?.trim() || null;
  const sourceUrl = options.sourceUrl !== undefined ? options.sourceUrl : product.sourceUrl || product.imageUrl || null;

  // Preserve and construct structured specifications
  const specifications: ProductSpecifications = {};
  if (product.specifications) {
    for (const [k, v] of Object.entries(product.specifications)) {
      if (v != null) {
        specifications[k] = v;
      }
    }
  }

  // Backfill color and size into specifications if not explicitly present
  if (product.color && !specifications.color) {
    specifications.color = product.color.trim();
  }
  if (product.size && !specifications.size) {
    specifications.size = product.size.trim();
  }
  if (model && !specifications.model) {
    specifications.model = model;
  }

  // Preserve identifiers
  const identifiers: ProductIdentifiers = { ...(product.identifiers || {}) };

  // Condition (only if visually supported)
  const condition: ProductCondition | undefined = product.condition;

  // Prefer clean pre-existing searchQuery if available, otherwise synthesize
  let searchQuery: string;
  if (product.searchQuery && product.searchQuery.trim().length > 0) {
    searchQuery = synthesizeQueries({
      name: product.searchQuery,
      brand,
      model,
      color: product.color,
      size: product.size,
      specifications,
    }).strictQuery;
  } else {
    const queryResult = synthesizeQueries({
      name,
      brand,
      model,
      color: product.color,
      size: product.size,
      specifications,
      identifiers,
    });
    searchQuery = queryResult.strictQuery || name;
  }

  return {
    id,
    name,
    brand,
    model,
    category,
    specifications,
    identifiers,
    condition,
    source: 'image',
    sourceUrl,
    searchQuery,
  };
}

/**
 * Synthesizes a CanonicalProduct from a product page URL extraction result.
 */
export function synthesizeFromLinkProduct(
  product: ExtractedProductData | Product,
  options: SynthesisOptions = {}
): CanonicalProduct {
  const id = options.id || product.id || generateCanonicalId();
  const name = (product.name || 'Product').trim();
  const brand = product.brand?.trim() || null;
  const model = product.model?.trim() || null;
  const category = product.category?.trim() || null;
  const sourceUrl = options.sourceUrl !== undefined ? options.sourceUrl : product.sourceUrl || null;

  // Preserve structured specifications
  const specifications: ProductSpecifications = {};
  if (product.specifications) {
    for (const [k, v] of Object.entries(product.specifications)) {
      if (v != null) {
        specifications[k] = v;
      }
    }
  }

  if (product.color && !specifications.color) {
    specifications.color = product.color.trim();
  }
  if (product.size && !specifications.size) {
    specifications.size = product.size.trim();
  }
  if (model && !specifications.model) {
    specifications.model = model;
  }
  if ('availability' in product && product.availability && !specifications.availability) {
    specifications.availability = product.availability;
  }

  // Preserve identifiers
  const identifiers: ProductIdentifiers = { ...(product.identifiers || {}) };

  const condition: ProductCondition | undefined = product.condition;

  // Synthesize clean search query without duplicate tokens or retailer prefixes
  const queryResult = synthesizeQueries({
    name,
    brand,
    model,
    color: product.color,
    size: product.size,
    specifications,
    identifiers,
  });

  return {
    id,
    name,
    brand,
    model,
    category,
    specifications,
    identifiers,
    condition,
    source: 'link',
    sourceUrl,
    searchQuery: queryResult.strictQuery || name,
  };
}

/**
 * Synthesizes a CanonicalProduct from a parsed free-form text search query.
 */
export function synthesizeFromParsedQuery(
  parsed: ParsedQuery,
  options: SynthesisOptions = {}
): CanonicalProduct {
  const id = options.id || generateCanonicalId();
  const name = (parsed.name || parsed.originalQuery).trim();
  const brand = parsed.brand || null;
  const model = parsed.model || null;
  const category = null;
  const sourceUrl = options.sourceUrl !== undefined ? options.sourceUrl : null;

  // Structured specifications from parsed query
  const specifications: ProductSpecifications = { ...parsed.specifications };

  if (parsed.color && !specifications.color) {
    specifications.color = parsed.color;
  }
  if (parsed.size && !specifications.size) {
    specifications.size = parsed.size;
  }
  if (parsed.storage && !specifications.storage) {
    specifications.storage = parsed.storage;
  }
  if (parsed.ram && !specifications.ram) {
    specifications.ram = parsed.ram;
  }
  if (parsed.series && !specifications.series) {
    specifications.series = parsed.series;
  }
  if (parsed.edition && !specifications.edition) {
    specifications.edition = parsed.edition;
  }
  if (parsed.gender && !specifications.gender) {
    specifications.gender = parsed.gender;
  }
  if (parsed.modelNumber && !specifications.modelNumber) {
    specifications.modelNumber = parsed.modelNumber;
  }
  if (parsed.styleCode && !specifications.styleCode) {
    specifications.styleCode = parsed.styleCode;
  }

  const identifiers: ProductIdentifiers = { ...(parsed.identifiers || {}) };

  // Generate clean search query
  const queryResult = synthesizeQueries({
    name,
    brand,
    model,
    color: parsed.color,
    size: parsed.size,
    specifications,
    identifiers,
  });

  return {
    id,
    name,
    brand,
    model,
    category,
    specifications,
    identifiers,
    condition: undefined,
    source: 'text',
    sourceUrl,
    searchQuery: queryResult.strictQuery || name || parsed.originalQuery,
  };
}

/**
 * Synthesizes a CanonicalProduct from a legacy or generic text Product object.
 */
export function synthesizeFromTextProduct(
  product: Product,
  options: SynthesisOptions = {}
): CanonicalProduct {
  // If product has unparsed name and no structured specs, parse it through queryParser
  if (!product.specifications || Object.keys(product.specifications).length === 0) {
    const parsed = parseTextQuery(product.name || product.searchQuery || '');
    return synthesizeFromParsedQuery(parsed, {
      id: options.id || product.id,
      sourceUrl: options.sourceUrl !== undefined ? options.sourceUrl : product.sourceUrl,
      ...options,
    });
  }

  const id = options.id || product.id || generateCanonicalId();
  const name = (product.name || product.searchQuery || 'Product').trim();
  const brand = product.brand?.trim() || null;
  const model = product.model?.trim() || null;
  const category = product.category?.trim() || null;
  const sourceUrl = options.sourceUrl !== undefined ? options.sourceUrl : product.sourceUrl || null;

  const specifications: ProductSpecifications = { ...(product.specifications || {}) };
  if (product.color && !specifications.color) specifications.color = product.color.trim();
  if (product.size && !specifications.size) specifications.size = product.size.trim();

  const identifiers: ProductIdentifiers = { ...(product.identifiers || {}) };

  const queryResult = synthesizeQueries({
    name,
    brand,
    model,
    color: product.color,
    size: product.size,
    specifications,
    identifiers,
  });

  return {
    id,
    name,
    brand,
    model,
    category,
    specifications,
    identifiers,
    condition: product.condition,
    source: 'text',
    sourceUrl,
    searchQuery: queryResult.strictQuery || name,
  };
}

/**
 * Converts a CanonicalProduct back into a UI-compatible Product model.
 */
export function canonicalToProduct(
  canonical: CanonicalProduct,
  extra: Partial<Product> = {}
): Product {
  return {
    id: canonical.id,
    name: canonical.name,
    brand: canonical.brand,
    model: canonical.model,
    color: typeof canonical.specifications.color === 'string' ? canonical.specifications.color : undefined,
    size: typeof canonical.specifications.size === 'string' ? canonical.specifications.size : undefined,
    category: canonical.category,
    condition: canonical.condition,
    source: canonical.source,
    sourceUrl: canonical.sourceUrl,
    searchQuery: canonical.searchQuery,
    specifications: canonical.specifications,
    identifiers: canonical.identifiers,
    ...extra,
  };
}
