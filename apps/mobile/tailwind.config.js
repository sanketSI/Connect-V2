// ============================================================
// TAILWIND / NATIVEWIND — the same class vocabulary the web app uses.
//
// The point of NativeWind here is not brevity, it is PORTABILITY: apps/web has 1,458
// className strings, and every one that resolves to the same token on both platforms is
// a line that can be moved across rather than rewritten. So the scale below is not
// Tailwind's default palette — it is the SI palette out of apps/web/src/index.css,
// under the same names the web app already types.
//
// Dark mode is 'class'-free: RN reports the system scheme, and `dark:` variants are
// driven by NativeWind's colorScheme, which follows useColorScheme() — the same signal
// the web app gets from prefers-color-scheme.
// ============================================================
// CACHE WARNING: edits to THIS file do not take effect on a warm Metro cache — the
// bundle keeps serving the previously compiled styles and the change looks like it did
// nothing. Restart with `npm run start:clear`. Verified by adding a unique colour here
// and finding it absent from the bundle until the cache was cleared.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Brand — identical in both themes.
        brand: {
          indigo: '#0E0071',
          blue: '#0070FC',
        },
        // Light theme (apps/web/src/index.css, the [data-theme='light'] block).
        ink: {
          DEFAULT: '#111827',   // --text-primary
          2: '#374151',         // --text-secondary
          3: '#5F6878',         // --text-tertiary
        },
        screen: '#F4FBFF',      // --bg-screen
        card: '#FFFFFF',        // --bg-card
        hairline: '#DEE7F2',    // --border-glass
        ok: '#13764E',          // --si-success-text
        bad: '#DC2626',         // --si-error-text
        primaryText: '#0355DB', // --si-primary-text
        // Dark theme pairs.
        'd-screen': '#0A0E24',
        'd-ink': '#F4F6FF',
        'd-ink2': '#CBD5F0',
        'd-ink3': '#93A0C8',
        'd-hairline': 'rgba(255,255,255,.08)',
        'd-ok': '#22D38B',
        'd-bad': '#F87171',
        'd-primaryText': '#5CA4FF',
      },
      fontFamily: {
        // Loaded by expo-font in the boot gate. Without these every screen falls back to
        // San Francisco / Roboto, which is the single biggest reason a native build stops
        // looking like the web one.
        //
        // NOTE THE NAMES. They are `hk-*`, not `medium`/`semibold`/`bold`, because those
        // collide with Tailwind's own font-WEIGHT utilities — and on React Native weight
        // alone does nothing useful: RN does not synthesise a SemiBold face out of the
        // Regular file, it needs the actual family. So a heading asks for `font-hk-semi`
        // and gets the real 600 face, rather than asking for `font-semibold` and getting
        // faux-bolded Regular (or, on Android, nothing at all).
        sans: ['HankenGrotesk_400Regular'],
        'hk-medium': ['HankenGrotesk_500Medium'],
        'hk-semi': ['HankenGrotesk_600SemiBold'],
        'hk-bold': ['HankenGrotesk_700Bold'],
      },
      borderRadius: {
        card: '16px',   // rounded-2xl on web
        pill: '999px',
      },
    },
  },
  plugins: [],
}
