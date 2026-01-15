import { defineConfig, mergeConfig } from "vitest/config"
import viteConfig from "./vite.config"

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Test environment
      environment: "jsdom",

      // Setup files
      setupFiles: ["./src/test/setup.ts"],

      // Global test utilities
      globals: true,

      // Coverage configuration
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html", "lcov"],
        exclude: [
          "node_modules/",
          "src/test/",
          "**/*.d.ts",
          "**/*.config.*",
          "**/mockData",
          "dist/",
          "**/*.test.{ts,tsx}",
          "**/*.spec.{ts,tsx}",
        ],
        include: ["src/**/*.{ts,tsx}"],
        // Coverage thresholds (start conservative, increase over time)
        thresholds: {
          lines: 50,
          functions: 50,
          branches: 40,
          statements: 50,
        },
      },

      // Test inclusion/exclusion patterns
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
  }),
)
