// ============================================================
// METRO, MONOREPO-AWARE.
//
// The default Metro config assumes the app owns everything under its own root.
// Here it does not: @connect/core lives at ../../packages/core and is symlinked in
// by npm workspaces, so Metro has to be told two things.
//
//   watchFolders     — where to LOOK. Without the repo root, editing a core selector
//                      does not trigger a reload, and Metro throws on the symlink
//                      because the real file sits outside its project root.
//   nodeModulesPaths — where to RESOLVE from, in order. The app's own node_modules
//                      FIRST: React 19.1 (Expo SDK 54) lives there precisely because
//                      the root holds React 18 for the web app. Get this order wrong
//                      and the bundle pulls React 18 into React Native.
//
// SDK 54, not the latest: Expo Go ships ONE SDK, and installing a newer project into an
// older Expo Go just refuses to open. The SDK floor is whatever is on the phones, so it
// is pinned here rather than chased.
//
// unstable_enablePackageExports: core ships an "exports" map (./storage.js,
// ./locales/index.js, …) and the boot gate imports those subpaths directly, so
// Metro must honour the field rather than guessing at file layout.
// ============================================================
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

// A NOTE ON `import()` IN THIS MONOREPO, because the failure mode is invisible until
// the app runs on a phone.
//
// A dynamic import is a RUNTIME request in dev: the device asks the dev server for that
// module by path, and Metro expresses those paths relative to the SERVER ROOT. With the
// root at apps/mobile, a module in packages/core has no valid relative name — it comes
// back as "./packages/core/lib/supabase" and resolves to nothing, while the bundle
// itself reports a perfectly healthy HTTP 200 because nothing requested it yet.
//
// unstable_serverRoot = workspaceRoot looks like the fix and is NOT: it re-roots the
// ENTRY too, and expo-router (in apps/mobile/node_modules) then resolves against the
// repo root, where it does not exist. Tried, measured, reverted.
// EXPO_NO_LAZY_BUNDLING=1 does not help either — `lazy=true` still arrives on the
// launch URL. Also tried, also reverted.
//
// What actually holds today: nothing on the boot path issues a cross-package `import()`
// any more. hydrate() answers "is a backend configured?" from env.js (a leaf) BEFORE
// reaching for ../lib/supabase.js, so seed mode never asks for it.
//
// STILL OPEN, and deliberately not papered over: point this app at a real Supabase
// (EXPO_PUBLIC_SUPABASE_URL + ANON_KEY) and hydrate() WILL take that import, and it
// will fail here the same way. Production bundles are single-file so a release build is
// unaffected — this is a dev-server limitation. Fixing it properly means either a
// resolveRequest shim mapping the escaped path back, or moving supabase behind a static
// import in core. Worth doing when Phase 6 turns the backend on; not before, since it
// would be a change to shared code with nothing yet exercising it.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Core is ESM with an exports map; the boot gate reaches for its subpath seams.
config.resolver.unstable_enablePackageExports = true

// NOTE: disableHierarchicalLookup stays OFF. It looks like the right hygiene in a
// monorepo — pin resolution to the two paths above and nothing else — but it also stops
// Metro walking into expo/node_modules, where the SDK keeps its own nested copies of
// expo-asset and friends. Turning it on cost a bundle that could not resolve expo-asset
// from Expo's own entry file. The React-duplication worry it was meant to solve is
// already handled by the ORDER of nodeModulesPaths above.

// NativeWind compiles global.css through Tailwind and feeds the result to the RN style
// system. It wraps LAST so it sees the monorepo resolver settings above.
module.exports = withNativeWind(config, { input: './global.css' })
