/**
 * Global type declarations for testing environment
 */

/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

declare global {
  // Ensure global test functions are available
  const describe: typeof import('vitest').describe;
  const it: typeof import('vitest').it;
  const test: typeof import('vitest').test;
  const expect: typeof import('vitest').expect;
  const beforeEach: typeof import('vitest').beforeEach;
  const afterEach: typeof import('vitest').afterEach;
  const beforeAll: typeof import('vitest').beforeAll;
  const afterAll: typeof import('vitest').afterAll;
  const vi: typeof import('vitest').vi;
}

export {};