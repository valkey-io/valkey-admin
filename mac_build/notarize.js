/* eslint-disable @typescript-eslint/no-require-imports */
const { notarize } = require("electron-notarize")

function shouldSkipNotarization() {
  require("dotenv").config({ path: "./mac_build/.env" })

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    console.log("  • ⚠️ nosign packaging detected. Skipping notarization step.")
    return true
  }

  const required = ["APPLE_ID", "APPLE_TEAM_ID", "APPLE_ID_APP_SPECIFIC_PASSWORD"]
  const missing = required.filter((key) => !process.env[key])
 
  if (missing.length > 0) {
    console.log(`  • ⚠️ Missing notarization credentials (${missing.join(", ")}). Skipping notarization step.`)
    return true
  }

  return false
}

exports.default = async function notarizing(context) {
  if (shouldSkipNotarization()) {
    return
  }

  console.log("  • begin notarization")

  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== "darwin") {
    return
  }

  const appName = context.packager.appInfo.productFilename

  return await notarize({
    tool: "notarytool",
    teamId: process.env.APPLE_TEAM_ID,
    appBundleId: "com.valkey.admin",
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_APP_SPECIFIC_PASSWORD,
  })
}
