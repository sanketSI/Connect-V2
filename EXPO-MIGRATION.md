# Connect → True Native (Expo) Migration Plan

Goal: ship Connect as a real mobile app (installable, native rendering, native camera/GPS,
eventually push notifications and store distribution) — not a WebView wrapper.

The one decision that makes this tractable was already made months ago: **screens never
touch data sources directly** — everything flows through `src/data/`. That layer, the
business logic, the i18n catalogs and the Supabase schema all port unchanged. What gets
rewritten is the view layer only.

---

## 1. What ports vs. what gets rewritten

| Asset | Fate |
|---|---|
| `src/data/*` (selectors, mutators, time windows, store codes, metrics) | ✅ ports — pure JS |
| `src/lib/seedData.js`, OLC encoder, compliance rules | ✅ ports |
| i18n: 18 × `common.json` catalogs, `languages.js` | ✅ ports |
| Supabase: schema, seed, `hydrate.js` design, `@supabase/supabase-js` | ✅ ports (URL polyfill note below) |
| Gemini client | ✅ ports (env mechanism changes) |
| Every screen (~14) + UI kit (~6 shared modules) | 🔁 rewritten in React Native |
| PhoneFrame / sheet-portal architecture | 🗑️ deleted — real devices don't need a fake phone, and native sheets don't need the portal hack |
| Tailwind classes | 🔁 NativeWind (same `className` mental model) |
| framer-motion | 🔁 Reanimated (+ Moti for a framer-like API) |
| Browser camera/GPS/EXIF/canvas | 🔁 expo-camera / expo-location / expo-image-manipulator |

Rough split: **~40% of the codebase ports untouched; ~60% (all view code) is rewritten.**

## 2. Repo shape — monorepo in this repo (recommended)

```
Connect/
├─ apps/
│  ├─ web/        ← the current Vite app, moved (Vercel keeps deploying it)
│  └─ mobile/     ← new Expo app (expo-router)
├─ packages/
│  └─ core/       ← src/data + src/lib logic + src/i18n + locales (NO DOM imports)
└─ supabase/      ← unchanged, shared by both apps
```

npm workspaces. `core` is the contract: if it imports `window`, `document`, or
`localStorage`, the build fails. Platform differences are injected:

- **storage**: `core` gets a tiny `storage` interface (get/set, sync facade over an
  async boot load). Web backs it with localStorage; mobile with AsyncStorage/MMKV.
  The async load folds into the existing boot-hydration step — the pattern already exists.
- **env**: `import.meta.env.VITE_*` (web) vs `process.env.EXPO_PUBLIC_*` (mobile),
  injected into core at boot, not read inside core.

## 3. Library mapping

| Today (web) | Expo app |
|---|---|
| Vite + React DOM | Expo SDK (latest) + expo-router (file-based tabs) |
| Tailwind + CSS vars | NativeWind v4 + `tokens.ts` (the SI palette: #0E0071 / #0070FC / #F9FAFD + dark pairs) |
| framer-motion | react-native-reanimated + Moti |
| BottomSheet portal | @gorhom/bottom-sheet (wrapped to match the current `<BottomSheet open onClose>` API so screen code stays recognisable) |
| Toast.jsx | same component pattern, RN Views + Reanimated |
| `navigator.geolocation` | expo-location |
| `<input capture="environment">` + hand-rolled JPEG/EXIF parser | expo-camera (`exif: true` — the parser gets simpler, not harder) |
| Canvas 16:9 crop | expo-image-manipulator |
| `vibrate()` | expo-haptics |
| `wa.me` / `sms:` / `tel:` anchors | `Linking.openURL` — better on device than in any browser |
| Hanken Grotesk + per-script Noto `<link>` | @expo-google-fonts packages, loaded per selected language |
| localStorage | AsyncStorage (or MMKV) behind the core storage interface |

## 4. Phases

**Phase 0 — Core extraction (foundation, no visible change)**
Split into workspaces; move data/i18n/logic into `packages/core`; add the storage + env
injection; web app consumes core and must behave byte-identically (build + lint + browser
pass is the gate). *This phase de-risks everything after it.*

**Phase 1 — Expo skeleton boots** — ✅ landed, `apps/mobile`
Expo **SDK 54** + expo-router tab layout, design tokens, i18n init off the shared static
catalog index, core hydration (seed + Supabase modes), AsyncStorage-backed storage
driver. Gate: `[data] source: seed` logs, the manifest serves `exposdk:54.0.0`, both
platforms bundle (HTTP 200), tabs render off real core selectors.

Three deviations from what this document assumed, all deliberate:

- **SDK 54, not "latest".** §3 says "Expo SDK (latest)"; that is the wrong target while
  Expo Go is the delivery mechanism. Expo Go carries exactly ONE SDK, and a project built
  against a newer one does not degrade — it refuses to open. The SDK is therefore pinned
  to what is installed on the phones (54: React 19.1.0, RN 0.81.5, expo-router 6), and
  moving it is a decision to be taken WITH the devices, not ahead of them. A custom dev
  build (Phase 6, EAS) is what removes this ceiling.
- **`apps/mobile` is NOT an npm workspace.** The root `workspaces` glob is `apps/web`,
  not `apps/*`, and core is linked with `file:../../packages/core`. SDK 54 pins React
  19.1.0 while `apps/web` is on React 18; inside one hoist root npm resolves a single
  react-dom for both and the web app starts depending on whichever React the phone build
  asked for. This is not theoretical — it was an ERESOLVE failure the moment the SDK
  moved. Metro's `nodeModulesPaths` is ordered app-first for the same reason.
- **NativeWind is deferred to Phase 2.** Tokens landed as `lib/tokens.js` (the SI hexes
  lifted verbatim from `index.css`, both themes) consumed through StyleSheet. Same
  values, one less moving part while the boot path was being proven.

Fonts and the Intl/Hermes polyfills are NOT done — English renders correctly, and the
Indic catalogs will need the font work before they are legible on device (sharp edge #1).

**Phase 2 — UI kit + chrome**
Card/AICard/Chip/pills/buttons/Stars/Avatar/Skeleton/AIShimmer in RN; TopBar; tab bar
(native safe-area); Toast; the gorhom BottomSheet wrapper. Gate: a styleguide screen
showing every primitive in light + dark.

**Phase 3 — The money screens** (in value order)
1. Login + OTP + store code (+ request-access sheet)
2. Home
3. **Calls** (list, filters, time windows, multi-select bulk actions, merged call detail
   with transcript + coach) — biggest single item
4. Customers (+ notes, + review-link builder via Linking)
5. Reviews (metrics, Nova filter sheet, time sheet, reply history)
6. Profile + read-only Business Profile + store switcher
Gate per screen: feature parity against the web app side-by-side, in Expo Go.

**Phase 4 — Native-API screens**
LocationVerify (expo-location distance gate, expo-camera live photo, EXIF match —
*this screen gets more honest on native, not less*), ManageMedia (picker, crop,
compliance scan — see Skia caveat), Hierarchy roll-up.

**Phase 5 — Platform polish**
Haptics pass, dark mode via `useColorScheme` mapped to existing token pairs, app icon +
splash, deep links, Urdu RTL (`I18nManager` — requires app reload on switch; known RN
constraint), Android back-button behaviour.

**Phase 6 — Distribution + native payoffs**
EAS builds (dev / preview / prod), TestFlight + Play internal track. Then the reasons to
be native at all: **push notifications for hot-lead missed calls**, real dialer
integration, and (replacing the prototype OTP) **Supabase Auth phone OTP**.

## 5. Sharp edges (named now, not discovered later)

1. **Hermes Intl gaps** — `Intl.RelativeTimeFormat` / `PluralRules` may be missing or
   partial on Hermes. `relativeTime()` and i18next plurals depend on them. Plan:
   @formatjs polyfills + locale data for our 18 locales, loaded with the language.
2. **`import.meta.glob`** (lazy catalogs) is Vite-only → generate a static locale index
   in core (small build script, shared by both apps).
3. **Sync storage reads** — data layer reads persisted state synchronously; AsyncStorage
   is async. Solved by loading storage into a memory cache during boot hydration (the
   boot-gate pattern in `main.jsx` already exists for exactly this shape of problem).
4. **Skia not in Expo Go** — the Laplacian sharpness scan in Smart Image Protection needs
   pixel access. Options: resolution-only check in Expo Go, full scan behind an EAS dev
   build, or move the scan server-side later. Decide in Phase 4, not now.
5. **RTL is app-level in RN** — Urdu flip needs `I18nManager.forceRTL` + reload, unlike
   the web's per-container `dir`. Acceptable; document in the language sheet.
6. **Module-scope data reads** (`const CALLS = getCalls()`) — fine in RN *if* hydration
   completes before screens are required; expo-router lazy-loads routes, and the boot
   gate enforces order, same trick as `main.jsx` today.
7. **Gemini keys stay client-side** on mobile too (`EXPO_PUBLIC_*` is public). Same
   posture as web; the real fix (a tiny proxy) is orthogonal and can come any time.

## 6. What stays true throughout

- **Nothing dummy.** Every ported screen keeps its real data paths — no RN screen ships
  with hardcoded stand-ins "until later".
- **Web app keeps working.** Vercel deploys `apps/web` from the same repo; the PM demo
  never goes dark during the migration.
- **One catalog set.** i18n keys stay shared; a string added for mobile lands in the same
  18 catalogs the web reads.
