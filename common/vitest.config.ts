import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Test inclusion patterns
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache"],

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter
    reporters: ["verbose"],

    // Mock reset behavior
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
})
