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
        matte: {
          bg: {
            primary: "#0D0D0D",
            secondary: "#141414",
            tertiary: "#1A1A1A",
            hover: "#1F1F1F",
            active: "#252525",
          },
          border: {
            subtle: "#1F1F1F",
            DEFAULT: "#2A2A2A",
            strong: "#333333",
          },
          text: {
            primary: "#E8E2D9",
            secondary: "#A89F91",
            tertiary: "#6B6358",
            muted: "#4A453D",
          },
          accent: {
            primary: "#D4A574",
            secondary: "#C9956B",
            hover: "#E0B585",
          },
        },
      },
    },
  },
  plugins: [],
}
