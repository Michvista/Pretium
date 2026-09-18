import type { Product, ProductIdentifiers, ProductSpecifications } from '@/types';

export interface ParsedQuery {
  /** Original search text query, preserved verbatim. */
  originalQuery: string;
  /** Primary title/name derived for display and search. */
  name: string;
  /** Brand name if explicitly identified in the query, else null. */
  brand: string | null;
  /** Specific model name or primary product subject, else null. */
  model: string | null;
  /** Product line or series (e.g. 'Air Force 1', 'Galaxy S', 'Samba'), else null. */
  series: string | null;
  /** Storage capacity (e.g. '256GB', '1TB'), else null. */
  storage: string | null;
  /** RAM capacity (e.g. '8GB', '16GB'), else null. */
  ram: string | null;
  /** Sizing (e.g. '10', 'US 10.5', 'XL', '32x32'), else null. */
  size: string | null;
  /** Color or colorway (e.g. 'Space Black', 'white', 'Triple Black'), else null. */
  color: string | null;
  /** Target gender (e.g. "Men's", "Women's", "Unisex", "Kids") if explicit, else null. */
  gender: string | null;
  /** Special edition or release marker (e.g. '07', 'OG', 'Retro'), else null. */
  edition: string | null;
  /** Manufacturer footwear/apparel style code (e.g. 'CW2288-111'), else null. */
  styleCode: string | null;
  /** Alphanumeric hardware model number (e.g. 'WH-1000XM5', 'SM-S928B'), else null. */
  modelNumber: string | null;
  /** Structured map of all extracted specifications. */
  specifications: ProductSpecifications;
  /** Structured map of all extracted identifiers. */
  identifiers?: ProductIdentifiers;
}

// Multi-word brands ordered first to prevent greedy single-token matching
const KNOWN_BRANDS = [
  'New Balance',
  'Under Armour',
  'The North Face',
  'Air Jordan',
  'B&O Play',
  'Bang & Olufsen',
  'Bowers & Wilkins',
  'Google Pixel',
  'Apple',
  'Samsung',
  'Sony',
  'Google',
  'Nike',
  'Adidas',
  'Jordan',
  'Puma',
  'Asics',
  'Reebok',
  'Vans',
  'Converse',
  'Dell',
  'HP',
  'Lenovo',
  'Asus',
  'Acer',
  'Microsoft',
  'LG',
  'Bose',
  'JBL',
  'Beats',
  'Canon',
  'Nikon',
  'Nintendo',
  'PlayStation',
  'Xbox',
  'Logitech',
  'Razer',
  'Dyson',
  'Philips',
  'Anker',
  'Xiaomi',
  'OnePlus',
  'Motorola',
  "Levi's",
  'Levis',
  'Zara',
  'H&M',
  'Gucci',
  'Prada',
  'Balenciaga',
  'Lululemon',
  'Patagonia',
  'Timberland',
  'Birkenstock',
  'Crocs',
  'Skechers',
];

// Multi-word iconic colors ordered first
const KNOWN_COLORS = [
  'Triple Black',
  'Triple White',
  'Space Black',
  'Space Gray',
  'Space Grey',
  'Natural Titanium',
  'Desert Titanium',
  'Black Titanium',
  'White Titanium',
  'Midnight Blue',
  'Deep Purple',
  'Pacific Blue',
  'Sierra Blue',
  'Rose Gold',
  'Phantom Black',
  'Lost and Found',
  'University Blue',
  'Royal Blue',
  'White Smoke',
  'Off White',
  'Starlight',
  'Midnight',
  'Black',
  'White',
  'Silver',
  'Gray',
  'Grey',
  'Gold',
  'Blue',
  'Red',
  'Green',
  'Yellow',
  'Purple',
  'Pink',
  'Orange',
  'Brown',
  'Beige',
  'Navy',
  'Cream',
  'Bred',
  'Panda',
];

// Product series / lines
const KNOWN_SERIES = [
  'Air Force 1',
  'Air Jordan',
  'Air Max',
  'Dunk Low',
  'Dunk High',
  'Dunk',
  'Samba',
  'Gazelle',
  'Stan Smith',
  'Superstar',
  'Yeezy Boost',
  'Yeezy',
  'Galaxy S',
  'Galaxy Z',
  'Galaxy Note',
  'Galaxy A',
  'MacBook Pro',
  'MacBook Air',
  'iPad Pro',
  'iPad Air',
  'iPad',
  'iPhone',
  'ThinkPad',
  'Yoga',
  'Legion',
  'XPS',
  'Inspiron',
  'ZenBook',
  'ROG',
  'QuietComfort',
  'SoundLink',
  '1000X',
  'PlayStation',
  'Xbox',
  'Pixel',
];

// Footwear style code pattern (e.g. CW2288-111, DZ5485-612, FZ5000-001)
const STYLE_CODE_REGEX = /\b([A-Z0-9]{5,6}[- ][0-9]{3})\b/i;

// Hardware model number patterns (e.g. WH-1000XM5, SM-S928B, A2849, RTX 4090)
const HARDWARE_MODEL_REGEX =
  /\b(WH-1000XM[2-5]|WF-1000XM[2-5]|SM-[A-Z][0-9]{3}[A-Z0-9]*(?:\/[A-Z0-9]+)?|A[0-9]{4}|RTX\s+[345]0[6789]0(?:\s+Ti)?|GTX\s+[12][06][678]0(?:\s+Ti)?)\b/i;

/**
 * Deterministically parses a free-form product search query into structured attributes.
 * Preserves raw extracted values without performing normalization or unit conversion.
 */
export function parseTextQuery(rawQuery: string): ParsedQuery {
  const originalQuery = rawQuery;
  const text = (rawQuery || '').trim();

  if (!text) {
    return {
      originalQuery,
      name: '',
      brand: null,
      model: null,
      series: null,
      storage: null,
      ram: null,
      size: null,
      color: null,
      gender: null,
      edition: null,
      styleCode: null,
      modelNumber: null,
      specifications: {},
    };
  }

  const specs: ProductSpecifications = {};
  const identifiers: ProductIdentifiers = {};

  // 1. Footwear Style Code
  let styleCode: string | null = null;
  const styleMatch = STYLE_CODE_REGEX.exec(text);
  if (styleMatch) {
    styleCode = styleMatch[1].trim();
    identifiers.mpn = styleCode;
    specs.styleCode = styleCode;
  }

  // 2. Hardware Model Number
  let modelNumber: string | null = null;
  const modelNumMatch = HARDWARE_MODEL_REGEX.exec(text);
  if (modelNumMatch) {
    modelNumber = modelNumMatch[1].trim();
    if (!identifiers.mpn) {
      identifiers.mpn = modelNumber;
    }
    specs.modelNumber = modelNumber;
  }

  // 3. Gender (explicit only)
  let gender: string | null = null;
  if (/\b(?:men'?s|mens|man|male)\b/i.test(text)) {
    gender = "Men's";
    specs.gender = gender;
  } else if (/\b(?:women'?s|womens|woman|female)\b/i.test(text)) {
    gender = "Women's";
    specs.gender = gender;
  } else if (/\bunisex\b/i.test(text)) {
    gender = 'Unisex';
    specs.gender = gender;
  } else if (/\b(?:kids|boys|girls|toddler|infant|gs|grade\s+school)\b/i.test(text)) {
    gender = 'Kids';
    specs.gender = gender;
  }

  // 4. RAM & Storage Extraction
  let ram: string | null = null;
  let storage: string | null = null;

  const ramWithKeyword = /\b(\d+\s*GB)\s*(?:RAM|unified\s+memory|memory)\b/i.exec(text);
  if (ramWithKeyword) {
    ram = ramWithKeyword[1].trim();
    specs.ram = ram;
  }

  const storageWithKeyword =
    /\b(\d+\s*(?:GB|TB))\s*(?:storage|SSD|internal\s+memory|ROM|capacity)\b/i.exec(text);
  if (storageWithKeyword) {
    storage = storageWithKeyword[1].trim();
    specs.storage = storage;
  }

  // If storage or RAM is still missing, scan for standalone capacity tokens (e.g. "36GB 1TB", "16GB 512GB", "256GB")
  const capMatches = [...text.matchAll(/\b(\d+\s*(?:GB|TB))\b/gi)]
    .map((m) => m[1].trim())
    .filter((val) => {
      if (ram && val.toLowerCase() === ram.toLowerCase()) return false;
      if (storage && val.toLowerCase() === storage.toLowerCase()) return false;
      return true;
    });

  if (capMatches.length === 1) {
    if (!storage) {
      storage = capMatches[0];
      specs.storage = storage;
    } else if (!ram && /GB/i.test(capMatches[0])) {
      ram = capMatches[0];
      specs.ram = ram;
    }
  } else if (capMatches.length >= 2) {
    // When multiple standalone capacity tokens appear without keywords (e.g. "36GB 1TB" or "16GB 512GB"):
    // Check if one is TB and one is GB
    const tbToken = capMatches.find((t) => /TB/i.test(t));
    const gbTokens = capMatches.filter((t) => /GB/i.test(t));

    if (tbToken && gbTokens.length > 0) {
      if (!storage) storage = tbToken;
      if (!ram) ram = gbTokens[0];
    } else if (gbTokens.length >= 2) {
      // Parse numeric values to assign smaller to RAM and larger to storage
      const parsedGbs = gbTokens.map((t) => ({ raw: t, num: parseInt(t, 10) }));
      parsedGbs.sort((a, b) => a.num - b.num);
      if (!ram) ram = parsedGbs[0].raw;
      if (!storage) storage = parsedGbs[parsedGbs.length - 1].raw;
    }
    if (storage) specs.storage = storage;
    if (ram) specs.ram = ram;
  }

  // 5. Edition Extraction
  let edition: string | null = null;
  const editionMatch = /\b(OG|Retro|07|'07|Special\s+Edition|SE|Anniversary)\b/i.exec(text);
  if (editionMatch) {
    edition = editionMatch[1].trim();
    specs.edition = edition;
  }

  // 6. Color Extraction (longest match first)
  let color: string | null = null;
  for (const candidateColor of KNOWN_COLORS) {
    const escaped = candidateColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const colorRegex = new RegExp(`\\b${escaped}\\b`, 'i');
    const cMatch = colorRegex.exec(text);
    if (cMatch) {
      // Preserve exact substring from query to maintain user casing
      color = text.slice(cMatch.index, cMatch.index + candidateColor.length);
      specs.color = color;
      break;
    }
  }

  // 7. Size Extraction
  let size: string | null = null;
  // A. Prefixed footwear/apparel size: e.g. "size 10", "US 10.5", "sz 11", "EU 42", "size XL", "sz M"
  const prefixedSize = /\b((?:size|sz|us|uk|eu)\s*(?:[0-9]+(?:\.[0-9]+)?|XXX?L|XXL|XL|XS|S|M|L))\b/i.exec(text);
  if (prefixedSize) {
    size = prefixedSize[1].trim();
    specs.size = size;
  } else {
    // B. Waist/Inseam pant size: e.g. "32x32", "34x30"
    const pantSize = /\b(\d{2}\s*x\s*\d{2})\b/i.exec(text);
    if (pantSize) {
      size = pantSize[1].trim();
      specs.size = size;
    } else {
      // C. Tail integer or decimal shoe size if preceded by known shoe series/brand
      const tailShoeSize = /\b(\d{1,2}(?:\.5)?)\s*$/i.exec(text);
      if (
        tailShoeSize &&
        !storage &&
        !ram &&
        /\b(shoe|sneaker|jordan|nike|adidas|dunk|force|samba)\b/i.test(text)
      ) {
        const num = Number(tailShoeSize[1]);
        if (num >= 4 && num <= 16) {
          size = tailShoeSize[1].trim();
          specs.size = size;
        }
      }
    }
  }

  // 8. Brand Extraction (explicit only)
  let brand: string | null = null;
  for (const candidateBrand of KNOWN_BRANDS) {
    const escaped = candidateBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const brandRegex = new RegExp(`\\b${escaped}\\b`, 'i');
    const bMatch = brandRegex.exec(text);
    if (bMatch) {
      brand = candidateBrand; // canonical brand name format
      break;
    }
  }

  // 9. Series Extraction
  let series: string | null = null;
  // Check Galaxy S/Z/A specifically to handle e.g. "Galaxy S25" or "Galaxy S24"
  if (/\bGalaxy\s+S\d*\b/i.test(text)) {
    series = 'Galaxy S';
    specs.series = series;
  } else if (/\bGalaxy\s+Z\b/i.test(text)) {
    series = 'Galaxy Z';
    specs.series = series;
  } else if (/\bGalaxy\s+A\d*\b/i.test(text)) {
    series = 'Galaxy A';
    specs.series = series;
  } else {
    for (const candidateSeries of KNOWN_SERIES) {
      const escaped = candidateSeries.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const seriesRegex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (seriesRegex.test(text)) {
        series = candidateSeries;
        specs.series = series;
        break;
      }
    }
  }

  // 11. Model Name Derivation
  // Strip out secondary attributes (storage, RAM, color, size, gender, edition) to isolate core model
  let cleanModelStr = text;
  if (brand) {
    const bRegex = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    cleanModelStr = cleanModelStr.replace(bRegex, ' ');
  }
  if (color) {
    const cRegex = new RegExp(`\\b${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    cleanModelStr = cleanModelStr.replace(cRegex, ' ');
  }
  if (size) {
    const sRegex = new RegExp(`\\b${size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    cleanModelStr = cleanModelStr.replace(sRegex, ' ');
  }
  if (storage) {
    const stRegex = new RegExp(`\\b${storage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    cleanModelStr = cleanModelStr.replace(stRegex, ' ');
  }
  if (ram) {
    const rRegex = new RegExp(`\\b${ram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    cleanModelStr = cleanModelStr.replace(rRegex, ' ');
  }
  if (gender) {
    cleanModelStr = cleanModelStr.replace(/\b(?:men'?s|mens|women'?s|womens|unisex|kids|gs)\b/gi, ' ');
  }

  // Remove trailing auxiliary words like "storage", "ram", "color", "size"
  cleanModelStr = cleanModelStr
    .replace(/\b(?:storage|ram|memory|size|sz|color|colour)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If modelNumber is present, prefer cleanModelStr if it contains more info (e.g. "WH-1000XM5")
  let model: string | null = cleanModelStr || modelNumber || series || null;

  // 12. Primary Name Assembly
  const nameParts = [brand, model].filter(Boolean);
  let name = nameParts.length > 0 ? nameParts.join(' ') : text;
  // If brand is already inside model, avoid duplicate
  if (brand && model && model.toLowerCase().includes(brand.toLowerCase())) {
    name = model;
  }

  return {
    originalQuery,
    name,
    brand,
    model,
    series,
    storage,
    ram,
    size,
    color,
    gender,
    edition,
    styleCode,
    modelNumber,
    specifications: specs,
    identifiers: Object.keys(identifiers).length > 0 ? identifiers : undefined,
  };
}

/**
 * Converts a raw search query directly into an application-compatible Product model.
 */
export function parseQueryToProduct(query: string): Product {
  const parsed = parseTextQuery(query);
  return {
    name: parsed.name || query,
    brand: parsed.brand,
    model: parsed.model,
    color: parsed.color,
    size: parsed.size,
    source: 'text',
    searchQuery: query,
    specifications:
      Object.keys(parsed.specifications).length > 0 ? parsed.specifications : undefined,
    identifiers:
      parsed.identifiers && Object.keys(parsed.identifiers).length > 0
        ? parsed.identifiers
        : undefined,
  };
}
