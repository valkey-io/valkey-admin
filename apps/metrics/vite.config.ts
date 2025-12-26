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

    rollupOptions: {
      // No longer externalizing the client, it will be bundled
      external: ["express"],
    },

    emptyOutDir: false,
  },
  ssr: {
    // Force Vite to bundle all other dependencies into the single output file.
    // `rollupOptions.external` will still take priority for `@valkey/client`.
    noExternal: true,
  },
})
