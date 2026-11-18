/** @type {import('tailwindcss').Config} */

// Every colour resolves through a CSS variable defined in src/index.css, which
// is what makes light mode one attribute on <html> instead of a `dark:` variant
// on every element. The scale is SEMANTIC, not literal: `surface` is always
// "the card", `muted` is always "secondary text" — each theme decides what
// those look like. Never hardcode a hex in a component; add a token here.
//
// `line` and `fill` are bare RGB triples meant to be used WITH an alpha
// modifier (`border-line/10`, `bg-fill/5`) — they're white-ish in the dark
// theme and near-black in the light one, so the same alpha reads as a hairline
// either way. Using them without an alpha gives a solid block; don't.
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Grounds
        ink: withAlpha('--ink'), // furthest back: the page
        surface: withAlpha('--surface'), // a card sitting on the page
        sunken: withAlpha('--sunken'), // a well inside a card (code, answers)

        // Hairlines and subtle fills — always used with an alpha modifier.
        line: withAlpha('--line'),
        fill: withAlpha('--fill'),

        // Text ramp, brightest to faintest.
        strong: withAlpha('--strong'), // headings, the word you should read first
        body: withAlpha('--body'), // paragraphs
        muted: withAlpha('--muted'), // labels, secondary detail
        faint: withAlpha('--faint'), // hints, timestamps, keyboard legends

        brand: {
          DEFAULT: withAlpha('--brand'),
          soft: withAlpha('--brand-soft'),
          deep: withAlpha('--brand-deep'),
        },
        accent: withAlpha('--accent'), // warm highlight for streaks / encouragement
        success: withAlpha('--success'),
        danger: withAlpha('--danger'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        'flip-in': {
          '0%': { transform: 'rotateX(90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0)', opacity: '1' },
        },
        'rise': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'flip-in': 'flip-in 0.35s ease-out',
        'rise': 'rise 0.4s ease-out',
      },
    },
  },
  plugins: [],
}
