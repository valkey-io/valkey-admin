# How to sign Linux packages

## Requirements
- GnuPG (`gpg`) installed on your system
- A GPG key pair for signing

## Generate a GPG key

If you don't already have a GPG key:

```bash
gpg --full-gen-key
```

- Choose **RSA and RSA**, key size **4096**
- Use a project identity (e.g., `Valkey Admin Releases <releases@valkey.io>`)
- Set a passphrase

## Find your key ID

```bash
gpg --list-secret-keys --keyid-format=long
```

Look for the line like `sec rsa4096/ABCDEF1234567890` — the part after the `/` is your key ID.

## Export the public key (for users to verify signatures)

```bash
gpg --armor --export <KEY_ID> > linux_build/valkey-admin.pub
```

## Local signing setup

1. Copy `.env.example` to `.env`
2. Optionally set `GPG_KEY_ID` to your key ID (if you have multiple GPG keys; otherwise the default key is used)
3. Build, sign, and package by running `npm run package:linux` from the root directory
4. You will be prompted to enter your GPG key passphrase

## CI/CD signing setup (GitHub Actions)

Export and base64-encode the private key:

```bash
gpg --armor --export-secret-keys <KEY_ID> | base64 > gpg-private-key-base64.txt
```

Add these GitHub Actions secrets:
- **`GPG_PRIVATE_KEY`** — contents of `gpg-private-key-base64.txt`
- **`GPG_PASSPHRASE`** — the passphrase for the key

The imported key is automatically used for signing (no need to specify a key ID in CI since only one key is in the keyring).

Then delete `gpg-private-key-base64.txt` from your machine. Keep a secure backup of the private key in a password manager.

## Verifying a signature

Users can verify a downloaded artifact with:

```bash
gpg --import valkey-admin.pub
gpg --verify Valkey-Admin-0.1.0.AppImage.asc Valkey-Admin-0.1.0.AppImage
```
