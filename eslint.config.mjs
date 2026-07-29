import globals from 'globals'
import react from 'eslint-plugin-react'

// ============================================================
// One job: catch identifiers that do not exist.
//
// Vite/esbuild never resolve free variables — an unknown name is assumed to be a
// global and the build succeeds, so a typo or a prop that was never threaded down
// only explodes when a user opens that screen. That is not hypothetical here: it
// shipped `store is not defined` on the Reviews tab, and `useMemo is not defined`
// three separate times. The tests did not catch any of them because they exercise
// the data layer, not the render tree.
//
// `no-undef` alone is not enough: JSX element names are JSXIdentifier nodes, which
// core scope analysis never turns into references, so `<Headphones />` with no import
// sails straight past it — exactly how that crash reached the Calls screen. The react
// plugin's `jsx-no-undef` covers that half.
//
// So this config turns on those two rules and deliberately nothing else. It is a
// correctness gate, not a style pass — no formatting rules, no opinions about the
// existing code. That keeps it green, which is the only way it stays in the deploy
// gate and keeps earning its place.
// ============================================================
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.vercel/**'],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // The monorepo spans four runtimes: browser (apps/web), node (scripts,
      // config), vitest (tests) and React Native/Hermes (apps/mobile). Declaring
      // them keeps `no-undef` focused on real mistakes instead of flagging
      // `process`, `describe` or `__DEV__`.
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
        // Hermes injects this; it is how the mobile boot gate tells a developer
        // build from a release one, the same role import.meta.env.DEV plays on web.
        __DEV__: 'readonly',
      },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
    },
  },
]
