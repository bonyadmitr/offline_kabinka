/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/offline_kabinka/',
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
  },
});
