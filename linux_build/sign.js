/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require("child_process")
const path = require("path")

function shouldSkipSigning() {
  const dotenvResult = require("dotenv").config({ path: "./linux_build/.env", debug: true })

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    console.log("  • ⚠️ nosign packaging detected. Skipping GPG signing step.")
    return true
  }

  if (!process.env.GPG_KEY_ID) {
    if (dotenvResult.error?.code === "ENOENT") {
      console.log("  • ⚠️ No linux_build/.env detected and GPG_KEY_ID not set. Skipping GPG signing step.")
    } else {
      console.log("  • ⚠️ GPG_KEY_ID not set. Skipping GPG signing step.")
    }
    return true
  }

  return false
}

exports.default = async function afterAllArtifactBuild(buildResult) {
  if (shouldSkipSigning()) {
    return []
  }

  const gpgKeyId = process.env.GPG_KEY_ID
  const gpgPassphrase = process.env.GPG_PASSPHRASE
  const artifactPaths = buildResult.artifactPaths || []
  const signedFiles = []

  const linuxArtifacts = artifactPaths.filter((f) => {
    const ext = path.extname(f).toLowerCase()
    return ext === ".appimage" || ext === ".deb"
  })

  if (linuxArtifacts.length === 0) {
    console.log("  • No Linux artifacts found to sign.")
    return []
  }

  console.log(`  • Signing ${linuxArtifacts.length} Linux artifact(s) with GPG key ${gpgKeyId}`)

  for (const artifact of linuxArtifacts) {
    const ascFile = `${artifact}.asc`
    try {
      const passphraseArgs = gpgPassphrase
        ? "--batch --yes --pinentry-mode loopback --passphrase-fd 0"
        : ""

      const command = `gpg --detach-sign --armor --local-user ${gpgKeyId} ${passphraseArgs} --output "${ascFile}" "${artifact}"`

      if (gpgPassphrase) {
        execSync(command, { input: gpgPassphrase, stdio: ["pipe", "pipe", "pipe"] })
      } else {
        execSync(command, { stdio: "pipe" })
      }

      console.log(`  • ✅ Signed: ${path.basename(artifact)} → ${path.basename(ascFile)}`)
      signedFiles.push(ascFile)
    } catch (err) {
      console.error(`  • ❌ Failed to sign ${path.basename(artifact)}: ${err.message}`)
      throw err
    }
  }

  return signedFiles
}
