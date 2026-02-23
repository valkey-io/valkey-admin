import { defineConfig } from "vite"
import { resolve } from "path"
import { builtinModules } from "module"

export default defineConfig({
  resolve: {
    alias: {
      "valkey-common": resolve(__dirname, "../../common/src"), // point directly to source
    },
  },
  build: {
    outDir: "dist",
    target: "node22",

    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      fileName: "server-bundle",
      formats: ["es"],
    },

    rollupOptions: {
      external: [
        "valkey-common",
        "@valkey/valkey-glide", 
        "ws", 
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },

    emptyOutDir: false,
  },
})
