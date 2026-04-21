/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("child_process")
const path = require("path")

function shouldSkipSigning() {
  require("dotenv").config({ path: "./linux_build/.env", debug: true })

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    console.log("  • ⚠️ nosign packaging detected. Skipping GPG signing step.")
    return true
  }

  return false
}

exports.default = async function afterAllArtifactBuild(buildResult) {
  if (shouldSkipSigning()) {
    return []
  }

  const gpgKeyId = process.env.GPG_KEY_ID || ""
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

  console.log(`  • Signing ${linuxArtifacts.length} Linux artifact(s)${gpgKeyId ? ` with GPG key ${gpgKeyId}` : " with default GPG key"}`)

  for (const artifact of linuxArtifacts) {
    const ascFile = `${artifact}.asc`
    const args = ["--detach-sign", "--armor"]

    if (gpgKeyId) {
      args.push("--local-user", gpgKeyId)
    }

    if (gpgPassphrase) {
      // to prevent GUI passphrase prompt (using passed in passphrase)
      args.push("--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0")
    }

    args.push("--output", ascFile, artifact)

    const result = spawnSync("gpg", args, {
      input: gpgPassphrase || undefined,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    })

    if (result.status !== 0) {
      const errMsg = result.stderr || result.error?.message || `exit code ${result.status}`
      console.error(`  • ❌ Failed to sign ${path.basename(artifact)}: ${errMsg}`)
      throw new Error(`GPG signing failed for ${path.basename(artifact)}`)
    }

    console.log(`  • ✅ Signed: ${path.basename(artifact)} → ${path.basename(ascFile)}`)
    signedFiles.push(ascFile)
  }

  return signedFiles
}
