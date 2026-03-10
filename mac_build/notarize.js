/* eslint-disable @typescript-eslint/no-require-imports */
const { notarize } = require("electron-notarize")

function shouldSkipNotarization() {
  const dotenvResult = require("dotenv").config({ path: "./mac_build/.env", debug: true })

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    console.log("  • ⚠️ nosign packaging detected. Skipping notarization step.")
    return true
  }

  if (dotenvResult.error?.code === "ENOENT") {
    console.log("  • ⚠️ No mac_build/.env detected. Skipping notarization step.")
    return true
  }
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
    appBundleId: "com.valkey.glide",
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_APP_SPECIFIC_PASSWORD,
  })
}
