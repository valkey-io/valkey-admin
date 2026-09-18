type EncryptResult = { ok: true; value: string } | { ok: false }

export const PASSWORD_NOT_STORED_WARNING =
  "This system has no secure credential store, so the password can't be saved and will be requested " +
  "on the next connection. Install or unlock your system keyring (e.g. gnome-keyring or KWallet) to " +
  "enable saved passwords."

export const secureStorage = {
  // Encrypt for PERSISTENCE. Reports whether real encryption happened so the
  // caller can refuse to persist an unprotected secret.
  encryptForStorage: async (password: string): Promise<EncryptResult> => {
    if (!password) return { ok: true, value: "" }
    if (!window.secureStorage) return { ok: false }
    return await window.secureStorage.encrypt(password)
  },

  decrypt: async (encrypted: string): Promise<string> => {
    if (!encrypted || !window.secureStorage) return ""
    return await window.secureStorage.decrypt(encrypted)
  },

  // True only when the OS actually has a secure store (not merely that we are in
  // Electron). Reflects safeStorage.isEncryptionAvailable() in the main process.
  isEncryptionAvailable: async (): Promise<boolean> => {
    if (!window.secureStorage?.isEncryptionAvailable) return false
    return await window.secureStorage.isEncryptionAvailable()
  },

  isAvailable: (): boolean => {
    return window.secureStorage ? true : false
  },
}

declare global {
  interface Window {
    secureStorage?: {
      encrypt: (password: string) => Promise<EncryptResult>
      decrypt: (encrypted: string) => Promise<string>
      isEncryptionAvailable: () => Promise<boolean>
    }
  }
}
