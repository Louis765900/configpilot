import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'scripts/components/**/*.test.ts'],
  },
})
