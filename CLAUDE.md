# CLAUDE.md

Persistent context for Claude Code. Read this first on every session.

---

## Project overview

**Caffè** (default theme) / **Cantina** (Star Wars theme) — a friends-only espresso ordering Progressive Web App. A customer opens the app on their phone, walks through a guided order flow (hot/iced → drink → caffeine → add-ons → name), and the owner gets a push notification on their iPhone with the order. The owner has a password-protected admin panel to manage the menu and mark orders complete.

**Audience:** the owner (one person) plus a handful of friends, all on iPhones, installed as a home-screen PWA. Not built for scale — built for ~10s of orders per day, not 1000s.

**Owner's workflow before Claude Code:** edited files in the GitHub web editor and let Vercel auto-deploy. Now switching to Claude Code for a real local dev loop.

---

## Tech stack

- **React 18** with hooks (no Redux, no Zustand — local state via `useState`, server state via Firestore listeners)
- **Vite** for bundling and dev server
- **No TypeScript** — plain JSX
- **No Tailwind, no shadcn, no UI lib** — all styling is **inline styles** driven off a `COLORS` object from the active theme. Don't add Tailwind without asking.
- **Firebase Firestore** for all data (menu, orders, push subscriptions, stats)
- **Vercel** for hosting and serverless functions (one function at `api/notify.js`)
- **Web Push** via standard `web-push` library on the server + service worker on the client. **Not Firebase Cloud Messaging.**
- **`lucide-react`** icons only — keep all icon usage in-family
- PWA configured via `public/manifest.json` and iOS-specific meta tags in `index.html`

---

## File layout

```
caffe-app/
├── api/
│   └── notify.js                Vercel serverless function — sends web pushes
├── public/
│   ├── manifest.json            PWA manifest
│   ├── sw.js                    Service worker (handles incoming push events)
│   ├── icon-192.png             Home-screen icon
│   ├── icon-512.png
│   ├── apple-touch-icon.png
│   └── favicon.png
├── src/
│   ├── main.jsx                 React entry point
│   ├── App.jsx                  THE BIG FILE — entire app UI lives here
│   ├── firebase.js              Firebase init + Firestore doc references
│   ├── push.js                  VAPID public key + subscribe/unsubscribe/notifyOrder
│   ├── config.js                ADMIN_PASSWORD + THEME_NAME (user-owned config)
│   └── themes.js                Theme definitions (default + starwars)
├── index.html                   iOS PWA meta tags live here
├── package.json
├── vite.config.js
└── README.md                    End-user setup guide (Firebase/GitHub/Vercel/push)
```

---

## The big file: `src/App.jsx`

Everything UI lives in one file. ~1300 lines. Components defined in order:

| Component | Role |
|---|---|
| `App` | Root. Holds all state. Decides Order vs Admin view. |
| `OrderView` | Customer-facing order flow (hot/iced → drink → caffeine → add-ons → place order). |
| `TempButton`, `BaseButton`, `SubLabel`, `SectionLabel` | Small presentational pieces for OrderView. |
| `NameSheet` | The "What's your name?" bottom-sheet modal that appears after tapping Place Order. |
| `NotifToggle` | Admin-only toggle to subscribe/unsubscribe the current device from push. |
| `TotalStat` | Big "Drinks served · all time" counter card. |
| `OpenOrders` | Live list of `status === 'open'` orders with a Done button on each. |
| `AdminView` → `PasswordGate` → `AdminPanel` | Password-gated owner panel. |

**Important: this is one file by design.** If you find yourself wanting to split it into 8 files, ask the owner first. Adding a tiny new component to the bottom of `App.jsx` is fine.

---

## State model (in `App` component)

- `view`: `'order' | 'admin'`
- `addons`: the live menu (syrups, spices, extras) — synced from Firestore `menus/default`
- `temp`: `'hot' | 'iced' | null`
- `base`: drink id string or null
- `decaf`: boolean
- `selected`: `{ syrups: [], spices: [], extras: [] }` of selected add-on IDs
- `askingName`, `orderPlaced`: modal/success-screen flags

When an order is placed, `submitOrder` (in `App`):
1. Writes a doc to Firestore `orders/{auto-id}` with `status: 'open'`
2. Atomically increments `stats/global.totalOrders`
3. Calls `notifyOrder` from `push.js` to fire a web push to all subscribed devices

---

## Firebase

**Project ID:** `espresso-ordering` (verify in Firebase Console if needed)

### Collections

| Path | Purpose | Schema |
|---|---|---|
| `menus/default` | The live menu add-ons. Single doc shared by everyone. | `{ syrups: [{id, name, price}], spices: [...], extras: [...] }` |
| `subscriptions/{deviceId}` | Push subscription per subscribed device. | `{ subscription: {...}, createdAt, userAgent }` |
| `orders/{auto-id}` | Each placed order. | `{ customerName, temp, decaf, drink, addons[], summary, status: 'open'|'completed', createdAt, completedAt? }` |
| `stats/global` | Running counters. | `{ totalOrders, lastOrderAt }` |

### Security rules

Friends-only, fully open read/write — secured by URL obscurity + the admin password, not by Firebase auth. This is intentional for the scale. **Do not lock down without discussing first.**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /menus/{menuId} { allow read, write: if true; }
    match /subscriptions/{subId} { allow read, write: if true; }
    match /orders/{orderId} { allow read, write: if true; }
    match /stats/{statsId} { allow read, write: if true; }
  }
}
```

### Required index

The OpenOrders listener uses `where('status', '==', 'open')` + `orderBy('createdAt', 'desc')`, which Firestore requires a composite index for. If you ever see an error in the console with a "create index" link, the user clicks it once. Already created in prod.

### Where keys/config live

- **Web SDK config** (apiKey, projectId, etc.) lives in `src/firebase.js`. These are public-safe per Firebase docs (browser keys are not secrets — security comes from rules + Google Cloud API-key restrictions).
- The owner has already restricted the API key in Google Cloud Console to only their Vercel domain. Don't expose new APIs on it.
- There was a plan to migrate the config to Vite env vars (`VITE_FIREBASE_*`) to clear a GitHub secret-scanning alert. Check `src/firebase.js` — if it reads `import.meta.env.VITE_FIREBASE_API_KEY`, that migration is done; if there are literal string values, it isn't.

---

## Vercel

- **Auto-deploys** on push to `main`
- **Framework preset:** Vite (auto-detected)
- **API routes:** anything under `api/` is a serverless function — currently just `api/notify.js`

### Env vars (set in Vercel Settings → Environment Variables)

| Name | Used by | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY` | `api/notify.js` | Must match the public key in `src/push.js` |
| `VAPID_PRIVATE_KEY` | `api/notify.js` | Server secret. Never log or echo. |
| `VAPID_CONTACT_EMAIL` | `api/notify.js` | Format: `mailto:owner@example.com` |
| `VITE_FIREBASE_*` (six vars) | `src/firebase.js` | Only present if the env-var migration was done |

After changing env vars, the user needs to redeploy from Vercel UI for them to take effect on existing builds. New commits pick them up automatically.

### Caching gotcha

When the user manually redeploys via the Vercel UI, the dialog defaults to **"Use existing Build Cache" checked**. That deploys the *previous* commit's code, not the latest. Always tell them to uncheck it.

---

## Push notifications

Standard Web Push (VAPID), not FCM. Flow:

1. Owner opens the PWA **from the home-screen icon** (not Safari) and taps "Turn on" in NotifToggle.
2. `push.js` → `subscribeToPush()` registers `/sw.js`, requests notification permission, gets a subscription object, writes it to `subscriptions/{deviceId}`.
3. When an order is placed, `push.js` → `notifyOrder()` reads all subscriptions from Firestore and POSTs them + the order text to `/api/notify`.
4. `api/notify.js` uses the `web-push` lib + VAPID keys from env to send a push to each subscription.
5. `public/sw.js` receives the push event and calls `self.registration.showNotification()`.

### iOS-specific gotchas (well-known traps)

- **Push only works for PWAs installed to the home screen.** Opening the URL in Safari and tapping Turn On will succeed-ish but the device will never actually buzz. The NotifToggle component shows a hint about this.
- iOS 16.4+ required. Anything from 2023 onward is fine.
- If the user initially tapped "Don't Allow," they must go to iPhone Settings → Notifications → [App Name] → enable, then return to the PWA and tap Turn On again.

### VAPID public key

Lives in `src/push.js` as `VAPID_PUBLIC_KEY`. Must exactly match `VAPID_PUBLIC_KEY` in Vercel env. If they're mismatched, subscriptions will fail silently in dev and 410 in prod.

---

## Themes

Defined in `src/themes.js`. Four themes: `default`, `starwars`, `fourthofjuly`, and `autumn`. Active theme picked by `THEME_NAME` in `src/config.js` — just change the string and commit.

A theme is a flat object exporting:
- `colors`: a palette including semantic tokens (`ctaBg`, `ctaText`, `selectedBg`, `selectedText`, `hotColor`, `featuredBg`/`featuredText`/`featuredGlow` for the seasonal drink card, `starfield: boolean`, `fireworks: boolean`, `leaves: boolean` for the background effect layers)
- `fontsLink`, `serifFont`, `sansFont`, `monoFont`: Google Fonts URL + font-family strings
- `brandName`, `tagline`, `heroPre`, `heroLine: [pre, accent, post]`, `brewingLabel`, `ownerHeroPre`, `ownerHeroLine`, `notifyTitle`: all copy strings
- `exclusiveDrinks: []`: extra drinks added to the base list **only when this theme is active** (Star Wars adds The Dark Side, Jedi Mind Trick, Blue Milk, The Wookiee, Twin Suns of Tatooine)

`App.jsx` does `const THEME = getTheme(THEME_NAME)` once at module load and uses `COLORS = THEME.colors`, `THEME.serifFont`, etc. everywhere.

### Adding a new theme

1. Add a new export in `themes.js` following the same shape (every key the default has must exist — no fallbacks)
2. Add it to the `THEMES` map at the bottom
3. The user sets `THEME_NAME` in `config.js` to switch

---

## Owner-owned config

These files contain values **only the owner should change**. When refactoring or replacing files, preserve them:

- `src/config.js` — `ADMIN_PASSWORD`, `THEME_NAME`
- `src/push.js` — `VAPID_PUBLIC_KEY` (the constant near the top)
- `src/firebase.js` — Firebase config (or env-var refs)
- `public/manifest.json` — app name, icons

If you need to replace `App.jsx` wholesale, never replace any of the above.

---

## Design conventions (visual)

- **Numbered steps:** customer order flow uses `01 · Hot or iced`, `02 · Choose your drink`, etc. — small-caps mono label with em-dash decoration. Match this pattern for any new step.
- **Headlines:** serif (Fraunces in default, Orbitron in Star Wars), large, tight tracking (`letterSpacing: '-0.03em'`), one accent word in italic + `COLORS.copperDark`. Example: `Build your *perfect* shot.`
- **Section labels:** mono font, ALL CAPS, `letterSpacing: '0.2em'`, `COLORS.copperDark`, small (10–11px).
- **Buttons:** primary CTAs use `COLORS.ctaBg` + `COLORS.ctaText` (NOT `espresso` + `cream`, which are surfaces). Chip-style selections use `COLORS.copper` for the active state.
- **Cards with content "selected" or important:** `COLORS.selectedBg` + `COLORS.selectedText` + `border: 1px solid ${COLORS.copper}40`.
- **Spacing:** `padding: '24px 20px 128px'` is the standard page padding (extra bottom for the sticky cart bar).
- **Border radius:** 12 (small inputs), 14 (input groups), 16 (cards/buttons), 18 (big buttons), 24 (modals), 999 (chips).

---

## Animations

All keyframes are declared once inside `App.jsx` in a `<style>` block near the top of the root component's return. Available keyframes:

- `fadeUp` — fade + slide up 12px (general section reveal)
- `fadeIn` — opacity only
- `popIn` — scale 0.3 → 1.15 → 1 (success check)
- `ringPulse` — scale 0.6 → 2.2, fade out (ring behind success check)
- `slideUpSheet` — translateY 100% → 0 (modal sheet)
- `shimmerNew` — box-shadow ring (new orders in admin)
- `float` — gentle up/down 4px loop
- `confettiOut` — uses CSS custom props `--dx`/`--dy` for direction (success-screen confetti dots)
- `leafFall` / `leafSway` — falling-leaves layer (`--drift`/`--spin` custom props), only when the theme sets `leaves: true`
- `sheen` — light sweep across the featured drink card

Helper classes also live there:
- `.step-enter` → fadeUp 0.45s
- `.new-order` → fadeUp + shimmerNew
- Generic `button { transition: ...; }` and `button:active { transform: scale(0.97); }`

Add new animations to this style block, not as separate `<style>` tags scattered through the file.

---

## Common tasks

### Add a new drink

Edit `BASE_DRINKS` (or `STAR_WARS_THEME.exclusiveDrinks` in `themes.js` if it's a Star Wars exclusive) in `App.jsx`:

```js
{ id: 'unique-id', name: 'Display Name', desc: 'Short description', group: 'shots' | 'milk', temps: ['hot' | 'iced'] }
```

`group: 'shots'` shows under "Espresso shots" subheader; `'milk'` shows under "Espresso with milk." `'featured'` renders the decorated `FeaturedButton` at the top of the list, skips the add-ons page, and asks only about whipped cream (Pumpkin Spice Latte uses this). `temps` controls which buttons (hot/iced) reveal the drink.

### Add an add-on category (e.g. "Sweeteners")

Three places:
1. Add to `DEFAULT_ADDONS` in `App.jsx` with the new key and default items
2. Add to `CATEGORY_LABELS` for the display name
3. Add the key to the `cats` arrays in `submitOrder` and the addon-render `.map(...)` in `OrderView`
4. Admin tabs `gridTemplateColumns` will need bumping (currently `repeat(3, 1fr)`)

### Change the admin password

`src/config.js` → `ADMIN_PASSWORD`. Already signed-in devices will be locked out (the saved key won't match the new password).

### Switch theme

`src/config.js` → `THEME_NAME = 'default'`, `'starwars'`, `'fourthofjuly'`, or `'autumn'`. Commit. That's it.

### Mark all open orders complete (e.g. end of day)

There's no bulk button — owner taps Done on each. Adding a "Mark all done" would be one button that loops `updateDoc` over orders where `status === 'open'`.

### Reset the total counter

Set `stats/global.totalOrders = 0` directly in Firebase Console. Counter is just a Firestore field.

---

## Don't break these

- The PWA must remain installable. Don't break `manifest.json` or the iOS meta tags in `index.html`.
- The service worker must stay at `/sw.js` (path is referenced in `push.js` registration). If you move it, also update the registration.
- Firestore document paths in `firebase.js`, `App.jsx`, and `push.js` must stay aligned. If you rename a collection, grep for all four usages.
- The VAPID public key in `src/push.js` and in Vercel's `VAPID_PUBLIC_KEY` env must match exactly.
- The composite Firestore index for `orders` (status + createdAt) must exist for the open-orders listener.

---

## Local dev

```
npm install
npm run dev
```

Vite serves on `http://localhost:5173` by default. Push notifications won't work over `http://localhost` from your phone — only on the deployed Vercel URL. For UI work, localhost is fine.

To test push end-to-end you need to push to GitHub and let Vercel deploy, then open the Vercel URL on the iPhone.

---

## Deploy flow

1. Commit to `main`
2. Vercel detects, builds (Vite), deploys (~30 seconds)
3. New URL is live; PWAs already installed pick up the new code on next open (service-worker cache permitting)

If a user reports "I don't see my changes," the usual culprits in order:
1. Vercel's manual redeploy used the build cache (uncheck the box)
2. Service worker caching the old shell — they need to delete the PWA and re-add
3. They're hitting a preview URL, not production

---

## Style/voice for changes

- The owner prefers **brief, action-oriented explanations**. Don't over-explain. Give the diff, say what changed in 1–3 lines.
- When updating one file, output just that file rather than the whole zip.
- When the owner asks for a new feature, ask 1–2 clarifying questions only if there's a real fork in the road; otherwise build the obvious-best version and ship.
- Respect the existing visual conventions (numbered steps, italicized accent words, mono small-caps labels). Don't introduce new patterns unless the owner asks.
- Code comments are sparse on purpose. Don't add a comment to every line — only the non-obvious bits.
