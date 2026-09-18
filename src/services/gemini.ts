import { synthesizeQueries } from '@/services/querySynthesis';
import type {
  Product,
  ProductCondition,
  ProductIdentifiers,
  ProductSpecifications,
} from '@/types';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? 'gemini-1.5-flash';

export const GEMINI_SYSTEM_PROMPT = `You are a precision computer vision and product identification engine for a price comparison application called Pretium.
Analyze the provided product photo, screenshot, or packaging image and return STRICT JSON adhering to this schema:
{
  "isProduct": boolean,             // true if the image contains a recognizable consumer/commercial product; false if non-product (landscape, person, pet, meme), totally black/blank, or too blurry/unidentifiable.
  "reason": string | null,          // If isProduct is false, brief reason (e.g. "Image is too blurry to identify any product", "No commercial product found in image").
  "name": string,                   // Descriptive canonical product name (e.g. "Sony WH-1000XM5 Wireless Headphones", "Nike Air Force 1 '07", or "Black Running Shoe" if brand is unidentifiable).
  "brand": string | null,           // Manufacturer / brand name ONLY if clearly visible, identifiable by logo/text, or unmistakably iconic. If unbranded or unknown, return null.
  "model": string | null,           // Specific model name/number if discernible (e.g. "WH-1000XM5", "Air Force 1 '07", "iPhone 15 Pro"). If unknown, null.
  "series": string | null,          // Product series or line if applicable (e.g. "1000X", "Galaxy S", "MacBook Pro", "Air Jordan").
  "category": string | null,        // Primary category (e.g. "smartphones", "laptops", "headphones", "sneakers", "apparel", "home_goods", "electronics").
  "color": string | null,           // Dominant visible color or official colorway (e.g. "Black", "Silver", "Triple White").
  "size": string | null,            // Size if visible on garment tag, shoe tongue label, or box (e.g. "US 10.5", "Medium", "14-inch").
  "gender": string | null,          // "Men's", "Women's", "Unisex", "Kids" ONLY if explicitly stated on visible label/box.
  "condition": "new" | "refurbished" | "used" | null, // ONLY if visually evident (e.g. factory sealed box = "new", certified refurbished sticker = "refurbished", visible wear/scratches = "used"). Return null if standard product photo or unknown.
  "styleCode": string | null,       // Sneaker / apparel manufacturer style code if visible on tag/box (e.g. "CW2288-111", "FZ5000-001").
  "visibleText": string[],          // List of legible text snippets, model numbers, or spec text printed on the product or packaging.
  "specifications": {               // Key-value map of visible technical or physical attributes (e.g. {"storage": "256 GB", "ram": "8 GB", "screenSize": "6.1 inch", "material": "Leather", "power": "1500W"}). Do NOT convert or normalize units.
    [key: string]: string | number
  },
  "identifiers": {                  // Industry identifiers if visible on barcodes, stickers, or packaging.
    "gtin": string | null,
    "upc": string | null,
    "mpn": string | null,           // Manufacturer part number or hardware model code (e.g. "A2849", "SM-S928U", "WH1000XM5/B")
    "sku": string | null,
    "asin": string | null
  },
  "description": string | null      // Brief 1-sentence description of the visual item.
}

CRITICAL RULES & HALLUCINATION GUARDS:
1. Ground truth only: Only extract attributes that are visually supported or clearly readable from the image. If an attribute cannot be established from visual evidence, return null or omit it.
2. DO NOT invent or assume: brand, model, series, storage capacity, RAM, release year, size, edition, or identifiers. If an unbranded item is shown, brand must be null.
3. Screenshots: If the image is a screenshot of a product listing, shopping app, or social media post, extract the product being shown and any visible specs/pricing from the text in the screenshot.
4. Packaging & labels: If retail boxes, price tags, or tongue labels are visible, prioritize extracting exact model numbers, style codes, and barcodes.
5. Blurry / non-product images: If the image is too blurry to reliably identify a product, or does not depict a product, set isProduct to false and name to "".
6. Return ONLY raw valid JSON. No markdown, no commentary.`;

export interface GeminiExtractedData {
  isProduct?: boolean;
  reason?: string | null;
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  series?: string | null;
  category?: string | null;
  color?: string | null;
  size?: string | null;
  gender?: string | null;
  condition?: 'new' | 'refurbished' | 'used' | null;
  styleCode?: string | null;
  visibleText?: string[] | null;
  specifications?: Record<string, string | number> | null;
  identifiers?: {
    gtin?: string | null;
    upc?: string | null;
    mpn?: string | null;
    sku?: string | null;
    asin?: string | null;
  } | null;
  description?: string | null;
}

/**
 * Robust JSON extraction from Gemini response text.
 * Strips markdown code blocks and handles surrounding text.
 */
export function parseGeminiResponse(rawText: string): GeminiExtractedData {
  if (!rawText || !rawText.trim()) {
    throw new Error('Gemini returned an empty response.');
  }

  let cleaned = rawText.trim();

  // Strip markdown code fences if present (e.g. ```json ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Attempt direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to locate outer-most curly braces
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted);
      } catch {
        // Fall through to error below
      }
    }
    throw new Error('Could not parse product details from Gemini response.');
  }
}

/**
 * Sends an image to Gemini Vision and returns a parsed Product with structured
 * specifications, identifiers, and visually-grounded attributes.
 * `base64` should be raw base64 of the image (no data URI prefix).
 */
export async function extractProductFromImage(
  uri: string,
  base64: string,
  mimeType: string = 'image/jpeg'
): Promise<Product> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set. Add it to your .env file.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: GEMINI_SYSTEM_PROMPT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    const body = (await response.text()) ?? '';
    throw new Error(`Gemini error ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new Error('Gemini returned no content.');
  }

  const parsed = parseGeminiResponse(text);

  // Check if Gemini determined this is not a commercial product or unreadable
  if (parsed.isProduct === false) {
    throw new Error(parsed.reason || 'Could not identify a product in that image.');
  }

  const name = (parsed.name ?? '').trim();
  if (!name) {
    throw new Error('Could not identify a product in that image.');
  }

  // Populate structured specifications dictionary
  const specs: ProductSpecifications = {};
  if (parsed.specifications && typeof parsed.specifications === 'object') {
    for (const [k, v] of Object.entries(parsed.specifications)) {
      if (v != null && (typeof v === 'string' || typeof v === 'number')) {
        const valStr = String(v).trim();
        if (valStr.length > 0) {
          specs[k] = v;
        }
      }
    }
  }

  if (parsed.series && !specs.series) {
    specs.series = parsed.series.trim();
  }
  if (parsed.gender && !specs.gender) {
    specs.gender = parsed.gender.trim();
  }
  if (parsed.styleCode && !specs.styleCode) {
    specs.styleCode = parsed.styleCode.trim();
  }
  if (Array.isArray(parsed.visibleText) && parsed.visibleText.length > 0 && !specs.visibleText) {
    const textJoined = parsed.visibleText
      .filter(Boolean)
      .map((t) => String(t).trim())
      .filter(Boolean)
      .join('; ');
    if (textJoined) {
      specs.visibleText = textJoined;
    }
  }

  // Populate product identifiers
  const identifiers: ProductIdentifiers = {};
  if (parsed.identifiers && typeof parsed.identifiers === 'object') {
    if (parsed.identifiers.gtin?.trim()) identifiers.gtin = parsed.identifiers.gtin.trim();
    if (parsed.identifiers.upc?.trim()) identifiers.upc = parsed.identifiers.upc.trim();
    if (parsed.identifiers.mpn?.trim()) identifiers.mpn = parsed.identifiers.mpn.trim();
    if (parsed.identifiers.sku?.trim()) identifiers.sku = parsed.identifiers.sku.trim();
    if (parsed.identifiers.asin?.trim()) identifiers.asin = parsed.identifiers.asin.trim();
  }
  if (parsed.styleCode?.trim() && !identifiers.mpn) {
    identifiers.mpn = parsed.styleCode.trim();
  }

  // Condition is strictly validated against allowed ProductCondition values
  const condition: ProductCondition | undefined =
    parsed.condition === 'new' || parsed.condition === 'refurbished' || parsed.condition === 'used'
      ? parsed.condition
      : undefined;

  const finalSpecs = Object.keys(specs).length > 0 ? specs : undefined;
  const finalIdentifiers = Object.keys(identifiers).length > 0 ? identifiers : undefined;

  // Synthesize clean search query without duplicate tokens
  const synthesized = synthesizeQueries({
    name,
    brand: parsed.brand ?? null,
    model: parsed.model ?? null,
    color: parsed.color ?? null,
    size: parsed.size ?? null,
    specifications: finalSpecs,
    identifiers: finalIdentifiers,
  });

  return {
    name,
    brand: parsed.brand ?? null,
    model: parsed.model ?? null,
    color: parsed.color ?? null,
    size: parsed.size ?? null,
    category: parsed.category ?? null,
    description: parsed.description ?? null,
    imageUrl: uri,
    source: 'image',
    condition,
    specifications: finalSpecs,
    identifiers: finalIdentifiers,
    searchQuery: synthesized.strictQuery || name,
  };
}

/**
 * Builds a search query by combining brand, name, model, color, and size.
 * Preserved for backwards compatibility with existing consumers.
 */
export function buildSearchQuery(product: {
  name: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  size?: string | null;
}): string {
  return [product.brand, product.name, product.model, product.color, product.size]
    .filter((part) => part && part.trim().length > 0)
    .join(' ');
}