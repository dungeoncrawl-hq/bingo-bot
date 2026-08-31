/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Headings only -- body text stays the default system sans stack
        // for readability. Cinzel reads as carved-stone/torchlit without
        // sacrificing legibility, unlike heavier blackletter-style fonts.
        display: ['Cinzel', 'serif'],
      },
    },
  },
  plugins: [],
};
