/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-strong': 'var(--surface-strong)',
        'surface-muted': 'var(--surface-muted)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        subtle: 'var(--subtle)',
        line: 'var(--border)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        up: 'var(--success)',
        down: 'var(--danger)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        display: ["'Space Grotesk'", 'sans-serif'],
        sans: ["'DM Sans'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
