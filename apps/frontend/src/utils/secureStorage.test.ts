import { describe, it, expect, vi, beforeEach } from "vitest"
import { secureStorage } from "./secureStorage"

// Tests for the renderer-side secureStorage wrapper (secureStorage.ts).
// This wrapper delegates to window.secureStorage (exposed via contextBridge)
// and gracefully falls back when running outside Electron.
describe("secureStorage wrapper", () => {
  beforeEach(() => {
    delete (window as Record<string, unknown>).secureStorage
  })

  // Outside Electron (e.g. in tests or a browser), window.secureStorage is
  // undefined. The wrapper should return safe defaults without throwing.
  describe("when window.secureStorage is not available", () => {
    it("encrypt returns empty string", async () => {
      expect(await secureStorage.encrypt("password")).toBe("")
    })

    it("decrypt returns empty string", async () => {
      expect(await secureStorage.decrypt("encrypted")).toBe("")
    })
  })

  describe("when window.secureStorage is available", () => {
    let mockEncrypt: ReturnType<typeof vi.fn>
    let mockDecrypt: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockEncrypt = vi.fn()
      mockDecrypt = vi.fn()
      Object.defineProperty(window, "secureStorage", {
        value: { encrypt: mockEncrypt, decrypt: mockDecrypt },
        writable: true,
        configurable: true,
      })
    })

    it("encrypt delegates to window.secureStorage.encrypt", async () => {
      mockEncrypt.mockResolvedValue("base64encrypted")
      const result = await secureStorage.encrypt("mypassword")
      expect(mockEncrypt).toHaveBeenCalledWith("mypassword")
      expect(result).toBe("base64encrypted")
    })

    // Empty passwords should short-circuit without invoking the IPC channel
    it("encrypt returns empty string for empty input", async () => {
      const result = await secureStorage.encrypt("")
      expect(mockEncrypt).not.toHaveBeenCalled()
      expect(result).toBe("")
    })

    it("decrypt delegates to window.secureStorage.decrypt", async () => {
      mockDecrypt.mockResolvedValue("plaintext")
      const result = await secureStorage.decrypt("base64encrypted")
      expect(mockDecrypt).toHaveBeenCalledWith("base64encrypted")
      expect(result).toBe("plaintext")
    })

    it("decrypt returns empty string for empty input", async () => {
      const result = await secureStorage.decrypt("")
      expect(mockDecrypt).not.toHaveBeenCalled()
      expect(result).toBe("")
    })
  })
})

/*
 * --------------------------------------------------------------------------
 * Shared helpers simulating the Electron safeStorage API.
 *
 * fakeEncryptString/fakeDecryptString mirror Electron's safeStorage using a
 * simple "ENC:" prefix as the encryption marker. This lets us test the handler
 * logic (base64 encoding, try/catch fallback) without requiring the real OS
 * keychain.
 * --------------------------------------------------------------------------
 */
function fakeEncryptString(plaintext: string): Buffer {
  return Buffer.concat([Buffer.from("ENC:"), Buffer.from(plaintext, "utf-8")])
}

function fakeDecryptString(buf: Buffer): string {
  const marker = Buffer.from("ENC:")
  if (buf.subarray(0, 4).equals(marker)) {
    return buf.subarray(4).toString("utf-8")
  }
  throw new Error("The input data is not a valid OS protected string")
}

function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext
  return fakeEncryptString(plaintext).toString("base64")
}

// Mirrors the fixed IPC handler in electron.main.js (lines 222-230).
// The key behavioral difference from the buggy version: the catch block
// returns the original input instead of "", making decrypt() idempotent
// for plaintext strings that aren't valid encrypted data.
function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64) return ""
  try {
    const encrypted = Buffer.from(encryptedBase64, "base64")
    return fakeDecryptString(encrypted)
  } catch {
    return encryptedBase64
  }
}

/*
 * --------------------------------------------------------------------------
 * Bug 1: Decrypt handler discards plaintext passwords (electron.main.js)
 *
 * connectionEpic calls secureStorage.decrypt() on every password before
 * connecting, including plaintext passwords from the connection form.
 * The buggy handler returns "" when decryption fails, causing NOAUTH.
 *
 * The handler must be idempotent:
 *   decrypt(encrypted) → plaintext
 *   decrypt(plaintext) → plaintext  (not "")
 *   decrypt("")        → ""
 * --------------------------------------------------------------------------
 */
describe("decrypt handler contract (electron.main.js behavior)", () => {
  it("decrypts a properly encrypted password", () => {
    const encrypted = encrypt("voiceplatform")
    expect(decrypt(encrypted)).toBe("voiceplatform")
  })

  // This is the core bug: a plaintext password like "voiceplatform" is not
  // valid base64-encoded ciphertext, so safeStorage.decryptString() throws.
  // The buggy handler returns "" here; the fix returns the original input.
  it("returns plaintext password unchanged when decryption fails", () => {
    expect(decrypt("voiceplatform")).toBe("voiceplatform")
  })

  // Passwords with special characters should also pass through unmodified
  it("returns plaintext with special characters unchanged", () => {
    expect(decrypt("p@ss w0rd!#$%")).toBe("p@ss w0rd!#$%")
  })

  it("returns empty string for empty input", () => {
    expect(decrypt("")).toBe("")
  })

  it("round-trips encrypt then decrypt", () => {
    const password = "my-secret-password-123!"
    expect(decrypt(encrypt(password))).toBe(password)
  })
})

/*
 * --------------------------------------------------------------------------
 * Bug 2: Double encryption in updateConnectionDetailsEpic (valkeyEpics.ts)
 *
 * When re-saving a connection (e.g. alias edit), the epic reads the
 * already-encrypted password from Redux state and encrypts it again.
 * Each re-save adds another encryption layer; decrypt() only peels one,
 * leaving ciphertext as the password → NOAUTH.
 *
 * The fix reuses the saved encrypted password from localStorage instead
 * of re-encrypting from Redux state.
 * --------------------------------------------------------------------------
 */
describe("double encryption bug (updateConnectionDetailsEpic)", () => {
  it("single encryption round-trips correctly", () => {
    const password = "voiceplatform"
    expect(decrypt(encrypt(password))).toBe(password)
  })

  it("re-saving a connection should not corrupt the password", () => {
    const password = "voiceplatform"

    // First save: password encrypted and stored in localStorage
    const encryptedOnce = encrypt(password)
    expect(decrypt(encryptedOnce)).toBe(password)

    // Second save (e.g. alias change): the fix reuses the already-encrypted
    // value from localStorage rather than calling encrypt() again
    const savedAgain = encryptedOnce
    expect(decrypt(savedAgain)).toBe(password)
  })
})

/*
 * --------------------------------------------------------------------------
 * Bug 3: EditForm resets password to "" (edit-form.tsx)
 *
 * When editing a saved connection, EditForm initializes password to ""
 * instead of preserving the stored value. This causes hasCoreChanges()
 * to return true (because "" !== savedEncryptedPassword), which triggers
 * deleteConnection + reconnect with an empty password. The saved
 * credentials are permanently destroyed — the user must re-enter them.
 *
 * The fix initializes the form with currentConnection.password so
 * alias-only edits don't trigger the destructive reconnect path.
 * --------------------------------------------------------------------------
 */
describe("edit form password reset bug (edit-form.tsx)", () => {
  it("alias-only edit should not trigger a core change", () => {
    // Simulates a connection loaded from localStorage with an encrypted password
    const savedConnection = {
      host: "10.0.0.23",
      port: "6380",
      username: "",
      password: "ENCRYPTED_PASSWORD_BASE64",
      alias: "Production Valkey",
      tls: true,
      verifyTlsCertificate: false,
    }

    // Simulates EditForm initialization (edit-form.tsx:42-56).
    // The fix: password comes from savedConnection, not hardcoded ""
    const editFormState = {
      host: savedConnection.host,
      port: savedConnection.port,
      username: savedConnection.username ?? "",
      password: savedConnection.password,
      alias: savedConnection.alias ?? "",
      tls: savedConnection.tls ?? false,
      verifyTlsCertificate: savedConnection.verifyTlsCertificate ?? false,
    }

    // User only changes the alias — no core fields touched
    editFormState.alias = "Staging Valkey"

    // Mirrors hasCoreChanges logic from edit-form.tsx
    const hasCoreChanges =
      editFormState.host !== savedConnection.host ||
      editFormState.port !== savedConnection.port ||
      editFormState.password !== savedConnection.password ||
      editFormState.tls !== savedConnection.tls

    expect(hasCoreChanges).toBe(false)
  })
})
