/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        text: 'var(--text)',
        textH: 'var(--text-h)',
        border: 'var(--border)',
        codeBg: 'var(--code-bg)',
        accent: 'var(--accent)',
        accentBg: 'var(--accent-bg)',
        accentBorder: 'var(--accent-border)',
      },
      boxShadow: {
        theme: 'var(--shadow)',
      },
      fontFamily: {
        sans: ['var(--sans)'],
        heading: ['var(--heading)'],
        mono: ['var(--mono)'],
      },
    },
  },
  plugins: [],
}
