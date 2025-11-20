import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  build: {
    outDir: "dist",
    target: "node22",

    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      fileName: "server-bundle",
      formats: ["cjs"],
    },

    rollupOptions: {
      external: ["@valkey/valkey-glide", "ws"], // Externalize native modules and ws
    },

    emptyOutDir: false,
  },
})
