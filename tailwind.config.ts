import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'site-bg': '#0a0506',
        'site-block': '#140a0b',
        'site-secondary': '#1A0B0B',
        'site-accent': '#FF2B4F',
        'site-dark-red': '#8B0018',
        'site-border': '#3A1017',
        'site-success': '#35C759',
        'site-danger': '#FF3B30',
        'site-text': '#F4ECEC',
        'site-muted': '#B09A9A',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        display: ['"Bebas Neue"', '"Arial Black"', 'sans-serif'],
        'mono-code': ['"JetBrains Mono"', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
