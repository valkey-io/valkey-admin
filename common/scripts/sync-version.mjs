import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"))
writeFileSync(resolve(root, "common/src/version.ts"), `export const APP_VERSION = "${version}"\n`)