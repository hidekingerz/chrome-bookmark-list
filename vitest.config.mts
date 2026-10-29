/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'test/', '**/*.d.ts'],
      // ループの完了ゲート（DoD）。`npm run test:coverage` がこのしきい値未達なら非0終了する。
      // `npm run test`（vitest run・coverage 無し）には影響しない。loop/VISION.md 参照。
      thresholds: {
        statements: 95,
        branches: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
