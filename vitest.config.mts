import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Tests de la lógica pura de lib/ (sin base de datos ni React). El alias "@"
// replica el de tsconfig.json para que los imports "@/lib/..." funcionen.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['lib/**/*.test.ts'],
  },
})
