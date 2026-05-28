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
        'site-bg': '#070707',
        'site-block': '#111111',
        'site-secondary': '#1A0B0B',
        'site-accent': '#FF2B4F',
        'site-dark-red': '#8B0018',
        'site-border': '#3A1017',
        'site-success': '#35C759',
        'site-danger': '#FF3B30',
        'site-text': '#F2F2F2',
        'site-muted': '#B8B8B8',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
