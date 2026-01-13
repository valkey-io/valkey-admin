import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  // Set the resolve conditions to ensure Node.js-specific versions of packages are used.
  resolve: {
    mainFields: ["module", "jsnext:main", "jsnext", "main"],
  },
  build: {
    // Set the build target to a Node.js environment.
    ssr: true,
    outDir: "dist",
    target: "node22",

    lib: {
      entry: resolve(__dirname, "src/index.js"),
      fileName: "index", // Vite will add the correct extension, e.g., .cjs
      formats: ["cjs"],
    },

    emptyOutDir: false,
  },
  ssr: {
    external: ["@valkey/valkey-glide"],
    noExternal: true,
  },
})
