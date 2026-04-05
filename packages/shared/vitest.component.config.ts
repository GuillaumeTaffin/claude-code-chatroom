import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.component.test.ts'],
    passWithNoTests: true,
  },
})
