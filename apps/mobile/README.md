# @connect/mobile — Connect as a native app

Phase 1 of [`EXPO-MIGRATION.md`](../../EXPO-MIGRATION.md): the Expo skeleton, rendering
real native views off the same `@connect/core` the web app uses.

## Run it

```bash
npm run start -w apps/mobile   # will NOT work — mobile is not a workspace
```

It is not a workspace (see below), so run it from its own directory:

```bash
cd apps/mobile && npm start
```

Then scan the QR **inside the Expo Go app** (Android: the scanner on Expo Go's home
screen; iOS: the system Camera, which hands off to Expo Go). Phone and Mac must be on the
same Wi-Fi — corporate networks with client isolation will block it.

## Two constraints that are easy to trip over

**1. The SDK is pinned to 54, on purpose.**

Expo Go bundles exactly one SDK. A project built against a newer SDK does not degrade
gracefully in an older Expo Go — it refuses to open. So the SDK floor is whatever is
installed on the test phones, and upgrading is a decision taken *with* the devices, not
ahead of them. `npx expo install --fix` realigns every SDK-managed package after a bump.

The escape hatch is a custom dev build (EAS, Phase 6): it embeds the SDK in your own
binary, and the version ceiling disappears along with Expo Go.

**2. This app is deliberately outside the npm workspaces.**

The root `workspaces` list is `apps/web`, not `apps/*`. SDK 54 pins React 19.1.0 and
`apps/web` runs React 18; in a shared hoist root npm resolves one react-dom for both and
the web app's React starts depending on what the phone build asked for. This app keeps
its own `node_modules` and links core with `file:../../packages/core`.

Consequences worth knowing:

- `npm install` at the repo root does **not** install this app. Run it here.
- Metro is told where to look — `watchFolders` covers the repo root so edits to
  `packages/core` hot-reload here, and `nodeModulesPaths` is ordered app-first so the
  bundle can never pull the web app's React 18 into React Native. See `metro.config.js`.

## What is real, and what is not yet

Real: the boot gate (seams → AsyncStorage preload → i18n → `hydrate()` → routes, the same
order as `apps/web/src/main.jsx`, for the same reasons), the storage driver, all 13
catalogs, and four tabs reading genuine core selectors — no hardcoded stand-ins.

Not yet: NativeWind, fonts (Indic scripts need them before those catalogs are legible on
device), Intl/Hermes polyfills, and Phases 2–6 — the UI kit, Login, Calls, Customers,
Reviews and the native-API screens.
