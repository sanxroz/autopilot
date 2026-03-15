import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 10000,
    pool: 'forks',
    isolate: true,
    // Ensure jsdom environment is properly configured
    environmentOptions: {
      jsdom: {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'http://localhost:3000',
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/vite-env.d.ts', 'src/main.tsx'],
    },
  },
});
