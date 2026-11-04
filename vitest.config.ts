import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['moteur/tests/**/*.test.ts', 'serveur/tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
