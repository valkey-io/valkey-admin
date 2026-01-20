export const secureStorage = {
  encrypt: async (password: string): Promise<string> => {
    if (!password) return password
    if (window.secureStorage) {
      return await window.secureStorage.encrypt(password)
    }
    return ""
  },

  decrypt: async (encrypted: string): Promise<string> => {
    if (!encrypted) return encrypted
    if (window.secureStorage) {
      return await window.secureStorage.decrypt(encrypted)
    }
    return encrypted
  },
}

declare global {
  interface Window {
    secureStorage?: {
      encrypt: (password: string) => Promise<string>
      decrypt: (encrypted: string) => Promise<string>
    }
  }
}
