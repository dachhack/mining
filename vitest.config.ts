import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Engine tests must not depend on a DOM, so the default is plain Node.
    environment: 'node',
    include: [
      'tests/engine/**/*.test.ts',
      'tests/golden/**/*.test.ts',
      'tests/tools/**/*.test.ts',
      // The app tests here use no DOM; the screen itself is tested by Playwright.
      'tests/app/**/*.test.ts',
    ],
  },
});
