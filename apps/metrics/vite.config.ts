import { defineConfig } from "vite"
import { resolve } from "path"

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: "dist",
    target: "node18",
    lib: {
      entry: resolve(__dirname, "src/index.js"),
      name: "metrics",
      fileName: "server-metrics",
      formats: ["cjs"],
    },
    rollupOptions: {
      external: ["fs", "path", "url", "yaml", /^node:/],
    },
    emptyOutDir: false,
  },
})
