/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Hanken Grotesk',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      colors: {
        // SingleInterface brand — deep indigo + electric blue
        si: {
          deep: '#0E0071',        // deep indigo (brand anchor)
          accent: '#0070FC',      // electric blue (primary)
          'accent-hover': '#0A0054',
          'accent-active': '#060038',
          base: '#F9FAFD',        // blue-tinted near-white screen bg
          surface: '#FFFFFF',
        },
        brand: {
          deep: '#0E0071',
          accent: '#0070FC',
          hover: '#0A0054',
        },
        // Legacy alias names kept pointing at brand tokens (nothing references these by class,
        // but retained so any stray reference resolves on-brand rather than to purple).
        nova: {
          purple: '#0070FC',
          'purple-deep': '#0E0071',
          'purple-hover': '#0A0054',
          sky: '#0070FC',
          pink: '#0070FC',
          orange: '#F97316',
          indigo: '#0E0071',
          lavender: '#F9FAFD',
        },
        ink: {
          950: '#111827',   // primary / headings
          900: '#111827',
          850: '#1F2937',
          800: '#374151',   // body (ink2)
          700: '#4B5563',
          600: '#6B7280',   // captions / placeholders (ink3)
          500: '#9CA3AF',
        },
        // Semantic
        success: '#16A34A',
        warning: '#CA8A04',
        error: '#DC2626',
        info: '#1D4ED8',
        star: '#F59E0B',
      },
      backgroundImage: {
        // AI gradient — reserved for AI surfaces ONLY (§2)
        'ai-gradient': 'linear-gradient(90deg, #0E0071 0%, #0070FC 100%)',
        'ai-warm': 'linear-gradient(135deg, #0E0071 0%, #0070FC 100%)',
        'ai-radial': 'radial-gradient(circle at 30% 20%, #4D9AFF 0%, #0070FC 45%, #0E0071 100%)',
        'ai-soft': 'linear-gradient(135deg, rgba(14,0,113,.55) 0%, rgba(0,112,252,.45) 100%)',
      },
      boxShadow: {
        // Elevation leans blue (§2)
        'glow-brand': '0 8px 24px rgba(0,112,252,.35), 0 2px 6px rgba(14,0,113,.25)',
        'glow-soft': '0 0 24px rgba(0,112,252,.22)',
        'card-light': '0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(0,112,252,.07)',
        'sheet-light': '0 -16px 50px rgba(15,23,42,.14)',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 24px rgba(0,112,252,.45), 0 0 0 0 rgba(0,112,252,.4)' },
          '50%': { boxShadow: '0 0 36px rgba(0,112,252,.7), 0 0 0 16px rgba(0,112,252,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(20px,-10px) scale(1.05)' },
          '66%': { transform: 'translate(-15px,10px) scale(.97)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        float: 'float 3s ease-in-out infinite',
        aurora: 'aurora 12s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
