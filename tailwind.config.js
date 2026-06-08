/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#070707',
        card: '#0F1117',
        'card-2': '#141821',
        primary: {
          DEFAULT: '#FF2B4F',
          glow: '#FF0037',
        },
        discord: '#5865F2',
        success: '#00FF7F',
        warning: '#FF8A00',
        muted: '#9CA3AF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Bebas Neue"', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 32px rgba(255, 0, 55, 0.35)',
        'glow-strong': '0 0 64px rgba(255, 0, 55, 0.55)',
        premium: '0 24px 64px -16px rgba(0, 0, 0, 0.6), 0 8px 24px -8px rgba(0, 0, 0, 0.5)',
        inset: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
      },
      backgroundImage: {
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        'red-radial': 'radial-gradient(ellipse at top, rgba(255,0,55,0.25) 0%, transparent 60%)',
        'play-gradient': 'linear-gradient(135deg, #FF2B4F 0%, #FF0037 100%)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 24px rgba(255, 0, 55, 0.35)' },
          '50%': { boxShadow: '0 0 48px rgba(255, 0, 55, 0.7)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ping-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
        'float': 'float 5s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'ping-ring': 'ping-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
