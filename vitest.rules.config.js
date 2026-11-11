import { defineConfig } from 'vitest/config';

// Firestore security-rules tests. Run with: npm run test:rules
// (starts the Firestore emulator, runs these tests, stops the emulator)
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.js'], environment: 'node', testTimeout: 20000, fileParallelism: false },
});
