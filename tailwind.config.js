/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      colors: {
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          hover: 'var(--color-bg-hover)',
          active: 'var(--color-bg-active)',
          solid: 'var(--color-bg-solid)',
        },
        border: {
          subtle: 'var(--color-border-subtle)',
          DEFAULT: 'var(--color-border-default)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          muted: 'var(--color-text-muted)',
        },
        accent: {
          primary: 'var(--color-accent-primary)',
          secondary: 'var(--color-accent-secondary)',
          hover: 'var(--color-accent-hover)',
        },
        semantic: {
          error: 'var(--color-semantic-error)',
          'error-muted': 'var(--color-semantic-error-muted)',
          success: 'var(--color-semantic-success)',
          'success-muted': 'var(--color-semantic-success-muted)',
          warning: 'var(--color-semantic-warning)',
          'warning-muted': 'var(--color-semantic-warning-muted)',
          info: 'var(--color-semantic-info)',
          'info-muted': 'var(--color-semantic-info-muted)',
          merged: 'var(--color-semantic-merged)',
          'merged-muted': 'var(--color-semantic-merged-muted)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--color-border-default)',
        subtle: 'var(--color-border-subtle)',
        strong: 'var(--color-border-strong)',
      },
      textColor: {
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        muted: 'var(--color-text-muted)',
      },
      backgroundColor: {
        primary: 'var(--color-bg-primary)',
        secondary: 'var(--color-bg-secondary)',
        tertiary: 'var(--color-bg-tertiary)',
        hover: 'var(--color-bg-hover)',
        active: 'var(--color-bg-active)',
        solid: 'var(--color-bg-solid)',
      },
    },
  },
  plugins: [],
}
