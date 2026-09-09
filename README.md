# Pretium

**Find the true price of anything, anywhere.**

Pretium is a cross-platform mobile app (Android-first) that helps users instantly find the best price for any product online. Search by text, paste a link, or screenshot a product — Pretium uses AI to identify the item and returns ranked results from multiple retailers worldwide, including shipping costs, sorted by total price.

Built for the RevenueCat Shipaton 2026.

---

## What It Does

Most price comparison tools require you to already know what site to search. Pretium removes that friction entirely.

You give it a product in any format:
- Type a product name ("Nike Air Force 1 white size 10")
- Paste a product link from any retailer
- Screenshot a product from an ad, a website, or even in a store

Pretium extracts the exact product details using AI, then searches across retailers to find the cheapest total cost including shipping. The matching engine ensures you're comparing the same item — not similar or knockoff variants.

---

## Core Features

### Free Tier
- Text search for any product
- Screenshot/image upload with AI-powered product extraction (Gemini Vision)
- Link paste — extracts product info from any retail URL via Open Graph tags
- Price comparison results ranked by total cost (price + shipping)
- Product matching accuracy — same item, not just similar ones
- Store name, seller info, and direct buy link
- 5 searches per day

### Premium (via RevenueCat)
- Unlimited daily searches
- Price drop alerts — set a target price and get notified
- Price history chart per product
- "Good time to buy" score powered by ML trend analysis
- Saved search history and wishlist

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | React Native (Expo), TypeScript |
| Navigation | React Navigation (Stack) |
| State management | Zustand |
| AI / Image extraction | Gemini Vision (gemini-1.5-flash) |
| Price data | SerpApi (Google Shopping) |
| Scraping fallback | ScrapeGraphAI |
| Backend / Database | Supabase (Postgres) |
| Subscriptions | RevenueCat SDK |
| Notifications | OneSignal |

---

## Tools & Services (Full Stack)

Everything Pretium touches, grouped by layer. Handy reference for the whole team.

### Mobile app
| Tool | What it's used for | Status |
|---|---|---|
| React Native 0.86 + Expo SDK 57 | Cross-platform app (Android-first) | ✅ installed |
| Expo Router (file-based, React Navigation) | All navigation: Home → Results → Product → Paywall | ✅ installed |
| TypeScript | Types for Product / PriceResult / Watchlist / etc. (`src/types`) | ✅ installed |
| Zustand | Global state (`src/store/useAppStore.ts`): premium flag, daily search limit, recent searches | ✅ installed |
| @shopify/flash-list | High-performance result list on ResultsScreen | ✅ installed |
| expo-image-picker | Camera + gallery capture for product screenshots | ✅ installed |
| expo-crypto | MD5 hashing for query/product cache keys | ✅ installed |
| expo-web-browser | Open Buy-Now links | ✅ installed |

### AI / extraction
| Tool | What it's used for | Key / account |
|---|---|---|
| Gemini Vision (`gemini-1.5-flash`) | Identify a product from an image → structured Product JSON | `EXPO_PUBLIC_GEMINI_API_KEY` (aistudio.google.com) |
| Open Graph parser (in-app) | Extract product info from pasted retail links (og:title / og:image / og:price) | none needed |

### Price data
| Tool | What it's used for | Key / account |
|---|---|---|
| SerpApi — Google Shopping engine | Fetch live prices across retailers, incl. shipping | `EXPO_PUBLIC_SERPAPI_KEY` (serpapi.com) |
| ScrapeGraphAI (fallback, stubbed) | Scrape retailer pages when SerpApi returns nothing | `EXPO_PUBLIC_SCRAPEGRAPH_API_KEY` (not set yet) |
| Mark's product matching model (Phase 6) | Filter results to the same product (confidence ≥ 0.7), match badge | pending Mark's code |
| Mark's price trend scoring (Phase 6) | rising / falling / stable + "good time to buy" score | pending Mark's code |

### Backend / database
| Tool | What it's used for | Key / account |
|---|---|---|
| Supabase (Postgres) | `price_cache` (1h TTL), `price_history`, `watchlist` tables | `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (supabase.com) |
| Schema | `supabase/schema.sql` — run once in the Supabase SQL editor | — |

### Monetization
| Tool | What it's used for | Key / account |
|---|---|---|
| RevenueCat SDK (v10) | Subscriptions, `premium` entitlement, paywall, restore | `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` (app.revenuecat.com) |
| RevenueCat REST API v2 | Server-side verification script (`scripts/revenuecat-setup.mjs`) | `REVENUECAT_SECRET_API_KEY` (v2 secret, needs "Project Configuration" permission) |

### Push notifications
| Tool | What it's used for | Key / account |
|---|---|---|
| OneSignal (`react-native-onesignal` 5.2.14 + `onesignal-expo-plugin` 2.7.1) | Push + in-app messages; App ID + NSE via Expo plugin | `EXPO_PUBLIC_ONESIGNAL_APP_ID` / `extra.oneSignalAppId` (app.json) |

### Quality / dev workflow
| Tool | What it's used for |
|---|---|
| Jest + jest-expo | Unit tests for services + store (`npm test`) |
| TypeScript (`tsc --noEmit`) | Type checking |
| Expo Go | Quick phone preview of JS-level features |
| EAS Build | Production builds (needed for RevenueCat + OneSignal native modules) |
| ESLint (`expo lint`) | Linting |

### Environment variables (.env, gitignored)
```
EXPO_PUBLIC_GEMINI_API_KEY=
EXPO_PUBLIC_SERPAPI_KEY=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=
EXPO_PUBLIC_ONESIGNAL_APP_ID=
ONESIGNAL_APP_ID=
REVENUECAT_API_KEY_ANDROID=
```

> ⚠️ **Native-only modules:** RevenueCat and OneSignal native SDKs do **not** run in Expo Go — they need a development build (`eas build` / `expo run:*`). Everything else works in Expo Go.

---

## Project Structure

```
Pretium/
  src/
    screens/
      HomeScreen.tsx
      SearchScreen.tsx
      ResultsScreen.tsx
      ProductDetailScreen.tsx
      PaywallScreen.tsx
    components/
      SearchBar.tsx
      ImagePickerInput.tsx
      ResultCard.tsx
      PriceTag.tsx
    services/
      gemini.ts          — Gemini Vision API integration
      serpapi.ts         — Price fetching from Google Shopping
      scraper.ts         — Fallback scraping via ScrapeGraphAI
      supabase.ts        — Database client and queries
      revenuecat.ts      — Subscription and entitlement checks
    store/
      useAppStore.ts     — Global Zustand state
    navigation/
      RootNavigator.tsx
    types/
      index.ts           — Shared TypeScript interfaces
  app/
    _layout.tsx          — Expo Router shell, renders RootNavigator
  .agents/
    skills/              — Installed agent skills
  supabase/
    schema.sql           — Database schema
```

---

## Team

| Person | Role |
|---|---|
| Michy | React Native app, AI integrations, frontend, RevenueCat, all screens |
| Mark | Product matching model, price history analysis, ML trend scoring, data pipeline |

---

## Environment Variables

```
EXPO_PUBLIC_GEMINI_API_KEY=
EXPO_PUBLIC_SERPAPI_KEY=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
REVENUECAT_API_KEY_ANDROID=
ONESIGNAL_APP_ID=
```

---

## Getting Started

```bash
git clone <repo-url>
cd Pretium
npm install
npx expo start
```

Scan the QR code with Expo Go on your Android device. Make sure your phone and laptop are on the same WiFi, or run `npx expo start --tunnel` if they're on different networks.

---

## Hackathon

Submitted to: [RevenueCat Shipaton 2026](https://revenuecat-shipaton-2026.devpost.com)  
Deadline: September 30, 2026  
Target categories: Grand Prize, #BuildInPublic Award, HAMM Award