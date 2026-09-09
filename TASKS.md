# Pretium — Full Task Board

> Tasks are ordered. Do not skip ahead. Each section builds on the previous.
> Agent tasks are marked with 🤖 — paste those directly into OpenCode.
> Manual tasks are marked with 👤 — you handle these yourself.

---
READ THE README FILE FOR MORE INFO 
## PHASE 1 — Project Setup

### 👤 1.1 Update .gitignore
Add to the bottom of `.gitignore`:
```
AGENTS.md
CLAUDE.md
TASKS.md
.agents
.claude
skills-lock.json
```

### 🤖 1.2 Restructure Expo Template
Paste Prompt 1 (Project Setup) into OpenCode.
Expected output: full `src/` folder structure with placeholder files, React Navigation wired up, TypeScript interfaces defined.

### 👤 1.3 Verify app runs on device
```bash
npx expo start
```
Scan QR code with Expo Go on your Android phone. Confirm the app loads. If it doesn't connect, run:
```bash
npx expo start --tunnel
```

### 👤 1.4 Create .env file
Create `.env` in the root:
```
EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
EXPO_PUBLIC_SERPAPI_KEY=your_key_here
EXPO_PUBLIC_SUPABASE_URL=your_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key_here
REVENUECAT_API_KEY_ANDROID=your_key_here
ONESIGNAL_APP_ID=your_id_here
```
Add `.env` to `.gitignore`.

### 👤 1.5 Get API keys
- Gemini: https://aistudio.google.com/app/apikey (free)
- SerpApi: https://serpapi.com (free tier = 100 searches/month, enough for hackathon)
- Supabase: https://supabase.com — create a new project, copy URL and anon key
- RevenueCat: https://app.revenuecat.com — create app, copy Android SDK key

---

## PHASE 2 — Input Methods + AI Extraction

### 🤖 2.1 Build all three input methods + Gemini Vision
Paste Prompt 2 (Three Input Methods) into OpenCode.
Expected output:
- Text search input working and logging a Product object
- Image picker working (camera + gallery), Gemini Vision returning parsed JSON
- Link paste working, Open Graph tags extracted and mapped to Product object

### 👤 2.2 Test all three inputs manually on your phone
- Type a product name, confirm console log shows Product object
- Screenshot a product image, confirm Gemini returns correct brand/name/attributes
- Paste an Amazon or Jumia link, confirm og:title and og:image are extracted

---

## PHASE 3 — Price Fetching

### 🤖 3.1 Build SerpApi integration
Prompt for agent:
```
Implement the fetchPrices function in src/services/serpapi.ts.

- Accept a Product object as input
- Build a search query string from product name, brand, model, and color
- Call the SerpApi Google Shopping endpoint:
  https://serpapi.com/search.json?engine=google_shopping&q={query}&api_key={key}
- Map the results to an array of PriceResult objects:
  { storeName, price, currency, shippingCost, totalCost, productUrl, inStock }
- Sort results by totalCost ascending (cheapest first)
- Cache results in Supabase (table: price_cache) with a 1-hour TTL so the same
  product search doesn't burn API quota repeatedly
- Return the sorted PriceResult array
- Handle API errors gracefully, return empty array on failure
- Read the API key from process.env.EXPO_PUBLIC_SERPAPI_KEY
```

### 🤖 3.2 Build Results screen
Prompt for agent:
```
Build the ResultsScreen.tsx in src/screens/.

It receives a Product object and an array of PriceResult objects via React Navigation params.

Display:
- Product name and brand at the top
- Product image if available
- A FlatList of result cards, each showing:
  - Store name
  - Price + currency
  - Shipping cost (show "Free shipping" if 0 or null)
  - Total cost (bold, prominent)
  - "Buy Now" button that opens productUrl in the device browser
- Sort toggle: "Total Price" / "Store Rating" (store rating is placeholder for now)
- Empty state if no results found
- Loading skeleton while results are fetching

Use FlashList instead of FlatList for performance (install @shopify/flash-list).
No UI polish yet — layout and functionality first.
```

---

## PHASE 4 — Supabase Backend

### 🤖 4.1 Set up Supabase schema
Prompt for agent:
```
Create the Supabase database schema for Pretium in supabase/schema.sql.

Tables needed:

1. price_cache
   - id: uuid primary key
   - query_hash: text unique (MD5 of the search query string)
   - results: jsonb (array of PriceResult objects)
   - created_at: timestamp
   - expires_at: timestamp (created_at + 1 hour)

2. price_history
   - id: uuid primary key
   - product_hash: text (MD5 of product name + brand + model)
   - store_name: text
   - price: numeric
   - currency: text
   - recorded_at: timestamp

3. watchlist
   - id: uuid primary key
   - user_id: text (RevenueCat user ID)
   - product_name: text
   - product_hash: text
   - target_price: numeric
   - current_price: numeric
   - created_at: timestamp

Also implement src/services/supabase.ts with these functions:
- getCachedResults(queryHash: string): Promise<PriceResult[] | null>
- setCachedResults(queryHash: string, results: PriceResult[]): Promise<void>
- savePriceHistory(productHash: string, results: PriceResult[]): Promise<void>
- getWatchlist(userId: string): Promise<WatchlistItem[]>
- addToWatchlist(userId: string, item: WatchlistItem): Promise<void>

Use the Supabase JS client. Read URL and anon key from environment variables.
```

---

## PHASE 5 — RevenueCat + Paywall

### 👤 5.1 Set up RevenueCat dashboard
- Go to https://app.revenuecat.com
- Create a new app called "Pretium"
- Create one entitlement: `premium`
- Create one product: monthly subscription ~$3.99/month
- Create one offering with that product
- Copy the Android SDK key into your .env

### 🤖 5.2 Integrate RevenueCat SDK
Prompt for agent:
```
Integrate RevenueCat into the Pretium React Native app.

Install: react-native-purchases

Implement src/services/revenuecat.ts with:
- initRevenueCat(): call Purchases.configure with REVENUECAT_API_KEY_ANDROID on app start
- isPremium(): check if the user has the "premium" entitlement, return boolean
- getOfferings(): fetch current offerings from RevenueCat
- purchasePremium(offering): initiate a purchase flow

In app/_layout.tsx, call initRevenueCat() on mount.

In src/store/useAppStore.ts, add:
- isPremium: boolean (default false)
- searchCount: number (default 0, resets daily)
- A checkAndIncrementSearch() action that:
  - If user is premium: allow search, increment count, return true
  - If user is not premium and count < 5: allow search, increment count, return true
  - If user is not premium and count >= 5: return false (triggers paywall)

Build PaywallScreen.tsx:
- Show premium benefits list
- Show price ($3.99/month)
- "Go Premium" button that calls purchasePremium
- "Restore Purchases" button
- "Maybe Later" dismiss button
```

---

## PHASE 6 — Mark's Integration (do this after Mark sends his code)

### 👤 6.1 Receive Mark's code
Mark will send you:
- A Python script or API endpoint for product matching
- A price trend scoring function
- Instructions for how to call his matching model

### 🤖 6.2 Integrate Mark's product matching
Prompt for agent (fill in details after Mark sends his code):
```
Integrate Mark's product matching model into Pretium.

Mark's matching endpoint: [INSERT URL OR FUNCTION DETAILS HERE]
Input: a Product object
Output: a confidence score (0-1) and a normalized product identifier

Update src/services/serpapi.ts:
- After fetching price results, call Mark's matching endpoint for each result
- Filter out results with confidence score below 0.7 (not the same product)
- Add a matchConfidence field to PriceResult

Update ResultsScreen.tsx:
- Show a "Verified match" badge on results with confidence > 0.9
- Show a "Possible match" badge on results with confidence 0.7-0.9
- Hide results below 0.7
```

### 🤖 6.3 Integrate Mark's price trend scoring
Prompt for agent (fill in after Mark sends his code):
```
Integrate Mark's price trend scoring into Pretium.

Mark's trend endpoint: [INSERT URL OR FUNCTION DETAILS HERE]
Input: product_hash + array of historical prices from Supabase price_history table
Output: { trend: "rising" | "falling" | "stable", score: 0-100, recommendation: string }

Add a PriceTrendCard component that shows:
- A small sparkline chart of the last 30 days of price history
- The trend direction with an arrow icon
- The recommendation text ("Good time to buy" / "Price may drop soon" / "Stable price")

Show this card on ProductDetailScreen.tsx, gated behind isPremium check.
```

---

## PHASE 7 — Polish + Launch Prep

### 🤖 7.1 App icon and splash screen
Prompt for agent:
```
Set up the app icon and splash screen for Pretium.

- App icon: a bold "P" lettermark in white on a deep navy (#0A0F2C) background, 1024x1024
- Splash screen: same navy background, "Pretium" wordmark centered in white
- Update app.json with the correct icon and splash config for Expo
- Generate all required icon sizes using expo-asset conventions
```

### 👤 7.2 Build for Android
```bash
eas build --platform android --profile preview
```
Install the APK on your phone and test everything end to end without Expo Go.

### 👤 7.3 Publish to Google Play Store
- Create a Google Play Developer account ($25 one-time fee)
- Create a new app called "Pretium"
- Upload the AAB from EAS Build
- Fill in store listing: description, screenshots, category (Shopping)
- Submit for review (takes 1-3 days, do this early)

### 👤 7.4 Record demo video (max 2 minutes)
Required for Shipaton submission. Show:
1. Open app
2. Text search for a product
3. Show results sorted by price
4. Screenshot a product image, show AI extracting it
5. Paste a product link, show results
6. Tap premium, show paywall
7. Show price history chart (Mark's feature)

Upload to YouTube (unlisted is fine).

### 👤 7.5 Devpost submission checklist
- [ ] App published on Google Play Store
- [ ] Demo video uploaded to YouTube (under 2 minutes)
- [ ] App description written
- [ ] 1024x1024 app icon uploaded
- [ ] At least one screenshot at 1179x2556px (no device frame)
- [ ] Free trial OR promo code so judges can test premium
- [ ] RevenueCat SDK integrated and at least one IAP working

---

## PHASE 8 — #BuildInPublic (do this every day)

This is a separate prize category worth $30,000. Post daily on X/Twitter.

Post ideas:
- Day 1: "Building a price comparison app for the Shipaton. Here's the idea:" + diagram
- Day 2: "Got Gemini Vision extracting product data from screenshots. Here's how:"
- Day 3: "SerpApi returning 8 price results for the same Nike shoe. Matching is the hard part."
- Every day: show code, show problems, show wins, ask questions, engage with replies

Tag every post: `#Shipaton2026 #BuildInPublic`