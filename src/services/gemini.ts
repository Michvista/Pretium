import type { Product } from '@/types';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
// gemini-1.5-flash is deprecated and gemini-2.x models are locked for new
// keys; gemini-3.6-flash is the current stable flash model (multimodal).
const MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? 'gemini-3.6-flash';

const SYSTEM_PROMPT = `You are a product identification engine for a price comparison app called Pretium.
Look at the product image and return STRICT JSON with these fields:
{
  "name": string,          // short descriptive product name, e.g. "Nike Air Force 1 Low White"
  "brand": string | null,
  "model": string | null,
  "color": string | null,
  "size": string | null,
  "category": string | null, // e.g. "sneakers", "laptop", "headphones"
  "description": string | null
}
Rules:
- The "name" must be specific enough to search for this exact product online.
- Infer size/brand/model/color only when visible in the image. Use null otherwise.
- Do not invent prices, URLs, or store names.
- Return ONLY valid JSON, no markdown, no commentary.`;

/**
 * Sends an image to Gemini Vision and returns a parsed Product.
 * `base64` should be raw base64 of the image (no data URI prefix).
 */
export async function extractProductFromImage(
  uri: string,
  base64: string,
  mimeType: string = 'image/jpeg'
): Promise<Product> {
  if (!API_KEY) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set. Add it to your .env file.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: SYSTEM_PROMPT },
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
    const body = await response.text();
    throw new Error(`Gemini error ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new Error('Gemini returned no content.');
  }

  const parsed = JSON.parse(text) as Partial<Product>;
  const name = (parsed.name ?? '').trim();
  if (!name) {
    throw new Error('Could not identify a product in that image.');
  }

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
    searchQuery: buildSearchQuery({
      name,
      brand: parsed.brand ?? null,
      model: parsed.model ?? null,
      color: parsed.color ?? null,
      size: parsed.size ?? null,
    }),
  };
}

export function buildSearchQuery(product: {
  name: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  size?: string | null;
}): string {
  const seen = new Set<string>();
  return [product.brand, product.name, product.model, product.color, product.size]
    .filter((part) => part && part.trim().length > 0)
    .flatMap((part) => part!.trim().split(/\s+/))
    .filter((token) => {
      const key = token.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}