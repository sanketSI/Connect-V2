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
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

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

module.exports = config
