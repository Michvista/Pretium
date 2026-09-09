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