# @connect/mobile — Connect as a native Android + iOS app

React Native 0.81.5 on **Expo SDK 54**, routed with expo-router 6, styled with
NativeWind 4. It renders native views off the same `@connect/core` the web app uses —
core holds every selector, lifecycle rule and canonical window, and neither platform
owns a copy.

Runs in **Expo Go** today. No Xcode, no Android Studio, no native build required.

---

## 1. Get the code

Private repo:

```bash
git clone https://github.com/sanketSI/Connect-V2.git
```

Developers need read access on `sanketSI/Connect-V2` (GitHub → Settings → Collaborators).
Everything below is in-repo — there is no second artefact to send.

## 2. Prerequisites

| What | Version | Notes |
| --- | --- | --- |
| Node | 22.x | Built and verified on 22.16.0 |
| npm | 10.x | |
| **Expo Go on the phone** | the build that carries **SDK 54** | This is the one that actually matters — see §6 |

Nothing else. Expo Go is a free App Store / Play Store download.

## 3. Install

**`npm install` at the repo root does NOT install this app.** It is deliberately outside
the npm workspaces (§6), so it has its own `node_modules`:

```bash
npm install                 # root: web + core
cd apps/mobile && npm install   # this app, separately
```

## 4. Run

```bash
cd apps/mobile && npm start
```

Then scan the QR **from inside Expo Go** — on Android that is Expo Go's own scanner; on
iOS use the system Camera, which hands off to Expo Go. Scanning it with a generic QR
reader opens a web page instead, which is not this app.

Phone and Mac must be on the **same Wi-Fi**. Corporate networks with client isolation
block the LAN connection; when that happens:

```bash
cd apps/mobile && npx expo start --tunnel
```

`--tunnel` routes through ngrok, so the two devices need no shared network at all. The
first run prompts to install `@expo/ngrok` — it is not a dependency here, so that prompt
is expected, and it needs a working network to fetch.

Other scripts: `npm run start:clear` (resets the Metro cache — needed after editing
`tailwind.config.js`, because NativeWind compiles styles at build time and a stale cache
silently serves the old ones), `npm run ios`, `npm run android`, `npm run doctor`.

## 5. Environment

Expo auto-loads `.env` / `.env.local` from **this** directory (`apps/mobile/`), not the
repo root. The repo-root `.env.example` covers the `VITE_*` web vars only; the native
equivalents are:

| Variable | Unset behaviour | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SCOPE` | `mvp` — the launch scope | `full` re-enables the north-star surfaces (location verify, review QR, the Premium auto-responder pitch). Must agree with web's `VITE_SCOPE`: a surface the web MVP hides must not appear on the phone. |
| `EXPO_PUBLIC_SUPABASE_URL` | seed mode | Without it the app runs on core's built-in demo seed, which is a fully working mode. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | seed mode | Anon key is public by design; RLS enforces access. |
| `EXPO_PUBLIC_GEMINI_API_KEYS` | written AI fallbacks | **Local dev only.** `EXPO_PUBLIC_*` is inlined into the bundle exactly as `VITE_*` is — a key here ships to the device. |
| `EXPO_PUBLIC_ANALYTICS_URL` | zero analytics calls | Events print to the console under `__DEV__`. |
| `EXPO_PUBLIC_APP_VERSION` | `native-dev` | Rides on every analytics event. |

**The prefix is the security boundary.** `EXPO_PUBLIC_*` reaches the device. Nothing
secret belongs in any of them.

> **Known gap — AI runs on fallbacks in Expo Go.** On web the production Gemini key lives
> server-side behind `/api/gemini` and the client POSTs to it. Core's `aiProxyUrl`
> defaults to that relative path, and a native app has no origin to resolve it against,
> so the proxy is unreachable from the phone and every AI surface (reply drafts, the
> "About this customer" read) uses its written fallback. `configureEnv()` in
> `app/_layout.jsx` does not yet inject an absolute proxy URL. Setting
> `EXPO_PUBLIC_GEMINI_API_KEYS` makes AI work by calling Google directly — acceptable on
> a dev machine, never in anything distributed.

## 6. Four constraints that are easy to trip over

**1. The SDK is pinned to 54, on purpose.**

Expo Go bundles exactly one SDK. A project built against a newer SDK does not degrade
gracefully in an older Expo Go — it refuses to open. So the floor is whatever is
installed on the test phones, and upgrading is a decision taken *with* the devices, not
ahead of them. `npx expo install --fix` realigns every SDK-managed package after a bump.

The escape hatch is a custom dev build (EAS): it embeds the SDK in your own binary and
the version ceiling disappears along with Expo Go.

**2. This app is deliberately outside the npm workspaces.**

Root `workspaces` is `apps/web`, not `apps/*`. SDK 54 pins React 19.1.0 and `apps/web`
runs React 18; in a shared hoist root npm resolves one react-dom for both and the web
app's React starts depending on what the phone build asked for. This app keeps its own
`node_modules` and links core with `file:../../packages/core`.

Consequences:

- Root `npm install` does not install this app. Run it here.
- `@connect/core` resolves through a **symlink**, so editing core's *source* hot-reloads
  straight into the phone — Metro's `watchFolders` covers the repo root.
- Core's own dependencies are a different matter: they hoist to the **root**
  `node_modules` (`@supabase/supabase-js` lives only there), and Metro finds them through
  the second entry of `nodeModulesPaths`. So **adding a dependency to `packages/core`
  means `npm install` at the repo root**, not here. Install it here as well only if it
  must resolve app-first — anything React-adjacent, for the reason above.
- `nodeModulesPaths` is ordered app-first (`apps/mobile/node_modules`, then the root) so
  the bundle can never pull the web app's React 18 into React Native.

**3. Metro pins single copies of some modules by hand.**

`metro.config.js` has a `resolveRequest` hook pinning `i18next` to one resolved path. Two
copies of i18next loaded simultaneously produced a real crash (`rupees()` failing on
`word.length` of undefined) because only one of them had been initialised. That file also
documents three approaches that were tried and reverted — read it before changing
resolution.

**4. A bundle that builds is not an app that runs.**

Three separate crashes in this port were invisible to a green `expo export` and only
appeared on device: two unresolvable dynamic `import()`s, and an iOS Fabric strict-typing
failure (`accessibilityState={{selected: openLevel}}` — Fabric rejects `null` where it
expects a boolean; `!!` fixed it). Verify on a phone, not on a bundle exit code.

## 7. What is built

All four tabs and every screen behind them:

- **Home** (`app/(tabs)/index.jsx`) — roll-up, missed-since-login, scope pill
- **Leads** (`app/(tabs)/leads.jsx`) — one list, every source, the 5-state lifecycle
- **Reviews** (`app/(tabs)/reviews.jsx`) — inbox, filter sheet, rating range, sentiment
  distribution, reply flow with AI draft (`app/review/[id].jsx`)
- **Your locations** (`app/(tabs)/locations.jsx`) — both leaderboards, ranked worst-first,
  grouped by the hierarchy's four rungs
- **Location Selector** (`app/switch.jsx`) — tabbed Sub-brand / State / City / Location,
  searchable, multi-select, Apply
- **Customer detail** (`app/customer/[id].jsx`), **store calls** (`app/store/[id].jsx`),
  **Profile** and everything under it (`profile.jsx`, `business-profile.jsx`,
  `manage-media.jsx`, `team.jsx`, `language.jsx`, `role.jsx`, `notifications.jsx`)

Real: the boot gate (seams → AsyncStorage preload → i18n → `hydrate()` → routes, the same
order as `apps/web/src/main.jsx`, for the same reasons), the AsyncStorage write-through
driver behind core's storage seam, Hanken Grotesk, all 13 catalogs, NativeWind with
light/dark driven by `Appearance`, and haptics. No hardcoded stand-ins — every number
comes from a core selector.

## 8. Known deviations from the web app

Deliberate and documented in the code, not defects to re-report:

- **Compact relative timestamps** print as clock times (`12:47 pm`) rather than `12m`.
  Hermes ships a trimmed `Intl`; the compact formatter needs a polyfill.
- **"Custom range"** period and date/time entry are plain text inputs — no native date
  picker yet.
- **Selector level captions** (Sub-brand / State / City / Location) are English. The
  catalogs carry no structural names for the hierarchy's rungs; inventing 13 translations
  for them is the kind of guess this repo refuses. Translator TODO.
- The catalog reply copy still signs off as "Team Lakshmi Electronics".

## 9. Gates

Run from the repo root — they cover core and the web app, which is where the shared logic
lives:

```bash
npm test && npm run lint && npm run i18n:lint && npm run build
```

For this app specifically, `cd apps/mobile && npx eslint app components lib`, and
`npx expo export --platform ios` to prove the bundle compiles. Per §6.4, neither is proof
it runs — put it on a handset.
