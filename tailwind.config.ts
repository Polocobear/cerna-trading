import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        cerna: {
          primary: '#7c5bf0',
          'primary-hover': '#6a4bd4',
          bg: {
            primary: '#0a0a0f',
            secondary: '#12121a',
            tertiary: '#1a1a25',
            elevated: '#22222f',
            hover: '#2a2a38',
          },
          text: {
            primary: '#e8e6f0',
            secondary: '#9896a8',
            tertiary: '#6b6980',
          },
          border: {
            DEFAULT: 'rgba(255, 255, 255, 0.08)',
            hover: 'rgba(255, 255, 255, 0.15)',
            active: 'rgba(124, 91, 240, 0.4)',
          },
          profit: '#22c55e',
          loss: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};

export default config;
