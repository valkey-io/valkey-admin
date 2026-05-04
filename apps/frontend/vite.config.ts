import { defineConfig } from "vite"
import path from "path"
import { readFileSync } from "fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"

const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@common": path.resolve(__dirname, "../../common"),
    },
  },
})
