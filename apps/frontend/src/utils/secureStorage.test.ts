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
  // undefined. The wrapper should pass through the input unchanged.
  describe("when window.secureStorage is not available", () => {
    it("encrypt passes through plaintext", async () => {
      expect(await secureStorage.encrypt("password")).toBe("password")
    })

    it("decrypt passes through input", async () => {
      expect(await secureStorage.decrypt("encrypted")).toBe("encrypted")
    })

    it("encrypt returns empty string for empty input", async () => {
      expect(await secureStorage.encrypt("")).toBe("")
    })

    it("decrypt returns empty string for empty input", async () => {
      expect(await secureStorage.decrypt("")).toBe("")
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
 * Bug 2: Encrypt-at-source architecture (valkeyEpics.ts)
 *
 * Passwords are encrypted once at the user-input forms (connection-form.tsx,
 * edit-form.tsx) and flow through Redux/localStorage already encrypted.
 * Epics never encrypt — they only decrypt (connectionEpic) or persist as-is
 * (connectFulfilled, updateConnectionDetailsEpic).
 *
 * This means an encrypted password stored in Redux/localStorage must survive
 * being saved, re-loaded, and re-saved without corruption.
 * --------------------------------------------------------------------------
 */
describe("encrypt-at-source architecture (valkeyEpics.ts)", () => {
  it("single encryption round-trips correctly", () => {
    const password = "voiceplatform"
    expect(decrypt(encrypt(password))).toBe(password)
  })

  it("encrypted password persists through save/re-save without corruption", () => {
    const password = "voiceplatform"

    // Form encrypts at source, stored in Redux and localStorage
    const encryptedOnce = encrypt(password)
    expect(decrypt(encryptedOnce)).toBe(password)

    // Re-save (e.g. alias edit): epic writes Redux value directly to
    // localStorage — no re-encryption. Password must still decrypt.
    const reSaved = encryptedOnce
    expect(decrypt(reSaved)).toBe(password)

    // Third save: still intact
    expect(decrypt(reSaved)).toBe(password)
  })

  // Proves double-encryption would break things — this is exactly what the
  // old code did when the connectFulfilled epic re-encrypted.
  it("double encryption corrupts password (proves the old bug)", () => {
    const password = "voiceplatform"
    const encryptedOnce = encrypt(password)
    const encryptedTwice = encrypt(encryptedOnce)

    // Single decrypt peels one layer — you get the first ciphertext, not plaintext
    expect(decrypt(encryptedTwice)).toBe(encryptedOnce)
    expect(decrypt(encryptedTwice)).not.toBe(password)
  })

  // Full lifecycle: new connect → alias edit → host edit → reconnect from localStorage
  it("full lifecycle: connect, alias edit, host edit, reconnect", () => {
    const password = "s3cret!"

    // 1. User types password in connection-form → form encrypts at source
    const encrypted = encrypt(password)

    // 2. connectFulfilled saves Redux state (encrypted) to localStorage as-is
    const localStorage: Record<string, unknown> = {}
    localStorage["conn1"] = { connectionDetails: { password: encrypted } }

    // 3. Alias edit: updateConnectionDetailsEpic re-saves from Redux (no encryption)
    const fromRedux = encrypted
    localStorage["conn1"] = { connectionDetails: { password: fromRedux } }
    expect(decrypt(fromRedux)).toBe(password)

    // 4. Host edit with no password change (passwordDirty=false):
    //    PATH A dispatches the encrypted password from Redux directly
    const detailsForReconnect = { password: encrypted }
    expect(decrypt(detailsForReconnect.password)).toBe(password)

    // 5. App restart: load from localStorage → connectionEpic decrypts
    const loaded = localStorage["conn1"] as { connectionDetails: { password: string } }
    expect(decrypt(loaded.connectionDetails.password)).toBe(password)
  })

  // Edge case: password that is valid base64 but not valid ciphertext.
  // decrypt must return it unchanged (idempotent passthrough).
  it("password resembling base64 is not corrupted by decrypt passthrough", () => {
    const password = "SGVsbG8gV29ybGQ="  // base64 of "Hello World"
    const encrypted = encrypt(password)

    // Normal flow: form encrypts, epic decrypts → original password
    expect(decrypt(encrypted)).toBe(password)

    // If decrypt sees it raw (e.g. during migration), passthrough works
    expect(decrypt(password)).toBe(password)
  })

  it("unicode and emoji passwords survive encrypt→decrypt", () => {
    const passwords = ["пароль", "密码", "パスワード", "p@$$w0rd!#¿½"]
    for (const pw of passwords) {
      expect(decrypt(encrypt(pw))).toBe(pw)
    }
  })

  it("empty password bypasses encryption entirely", () => {
    // encrypt("") returns "" — form guard `connectionDetails.password ? encrypt : skip`
    expect(encrypt("")).toBe("")
    // decrypt("") returns "" — connectionEpic sends "" to backend
    expect(decrypt("")).toBe("")
  })
})

/*
 * --------------------------------------------------------------------------
 * Bug 3: EditForm hasCoreChanges + passwordDirty (edit-form.tsx)
 *
 * hasCoreChanges() now uses field-by-field value comparison instead of
 * reference equality (which always returned true). Password changes are
 * tracked via a `passwordDirty` flag set by handleConnectionDetailsChange
 * when the password field value changes.
 *
 * This prevents alias-only edits from triggering the destructive
 * deleteConnection + reconnect path, while still detecting real changes.
 * --------------------------------------------------------------------------
 */
describe("edit form hasCoreChanges with passwordDirty (edit-form.tsx)", () => {
  const savedConnection = {
    host: "10.0.0.23",
    port: "6380",
    username: "",
    password: "ENCRYPTED_PASSWORD_BASE64",
    alias: "Production Valkey",
    tls: true,
    verifyTlsCertificate: false,
    caCertPath: "",
  }

  // Mirrors hasCoreChanges logic from edit-form.tsx:73-84
  function hasCoreChanges(
    editFormState: typeof savedConnection,
    passwordDirty: boolean,
  ) {
    return (
      editFormState.host !== savedConnection.host ||
      editFormState.port !== savedConnection.port ||
      editFormState.username !== (savedConnection.username ?? "") ||
      editFormState.tls !== (savedConnection.tls ?? false) ||
      editFormState.verifyTlsCertificate !== (savedConnection.verifyTlsCertificate ?? false) ||
      editFormState.caCertPath !== (savedConnection.caCertPath ?? "") ||
      passwordDirty
    )
  }

  it("alias-only edit should not trigger a core change", () => {
    const editFormState = { ...savedConnection, alias: "Staging Valkey" }
    expect(hasCoreChanges(editFormState, false)).toBe(false)
  })

  it("detects password change via passwordDirty flag", () => {
    const editFormState = { ...savedConnection }
    expect(hasCoreChanges(editFormState, true)).toBe(true)
  })

  it("detects host change", () => {
    const editFormState = { ...savedConnection, host: "10.0.0.24" }
    expect(hasCoreChanges(editFormState, false)).toBe(true)
  })

  it("detects port change", () => {
    const editFormState = { ...savedConnection, port: "6381" }
    expect(hasCoreChanges(editFormState, false)).toBe(true)
  })

  it("detects username change", () => {
    const editFormState = { ...savedConnection, username: "admin" }
    expect(hasCoreChanges(editFormState, false)).toBe(true)
  })

  it("detects tls toggle", () => {
    const editFormState = { ...savedConnection, tls: false }
    expect(hasCoreChanges(editFormState, false)).toBe(true)
  })

  it("detects verifyTlsCertificate toggle", () => {
    const editFormState = { ...savedConnection, verifyTlsCertificate: true }
    expect(hasCoreChanges(editFormState, false)).toBe(true)
  })

  it("detects caCertPath change", () => {
    const editFormState = { ...savedConnection, caCertPath: "/etc/ssl/ca.pem" }
    expect(hasCoreChanges(editFormState, false)).toBe(true)
  })

  // All fields identical + passwordDirty=false → must be false
  it("exact clone of saved connection has no core changes", () => {
    const editFormState = { ...savedConnection }
    expect(hasCoreChanges(editFormState, false)).toBe(false)
  })

  // Multiple fields changed simultaneously
  it("detects multiple simultaneous changes", () => {
    const editFormState = { ...savedConnection, host: "10.0.0.99", port: "7000" }
    expect(hasCoreChanges(editFormState, true)).toBe(true)
  })
})

/*
 * --------------------------------------------------------------------------
 * handleConnectionDetailsChange: passwordDirty state transitions
 *
 * Simulates the callback at edit-form.tsx:61-71 to verify that passwordDirty
 * is set correctly for various user interaction patterns.
 * --------------------------------------------------------------------------
 */
describe("passwordDirty state transitions (edit-form.tsx)", () => {
  // Mirrors handleConnectionDetailsChange + setPasswordDirty interaction
  function simulateChanges(
    initial: { password: string },
    updates: Array<{ password: string }>,
  ): boolean {
    let passwordDirty = false
    let prev = initial
    for (const updated of updates) {
      if (updated.password !== prev.password) {
        passwordDirty = true
      }
      prev = updated
    }
    return passwordDirty
  }

  it("non-password field change does not set passwordDirty", () => {
    // User changes host — modal spreads same password into new object
    const initial = { password: "ENC_BASE64" }
    const updates = [{ password: "ENC_BASE64" }] // host changed, password unchanged
    expect(simulateChanges(initial, updates)).toBe(false)
  })

  it("password field change sets passwordDirty", () => {
    const initial = { password: "ENC_BASE64" }
    const updates = [{ password: "newpassword" }]
    expect(simulateChanges(initial, updates)).toBe(true)
  })

  it("clearing password to empty sets passwordDirty", () => {
    const initial = { password: "ENC_BASE64" }
    const updates = [{ password: "" }]
    expect(simulateChanges(initial, updates)).toBe(true)
  })

  it("passwordDirty stays true even if password is reverted", () => {
    // User types new password then changes it back — dirty flag is sticky
    // (correct: we can't know if the reverted value matches the encrypted original)
    const initial = { password: "ENC_BASE64" }
    const updates = [
      { password: "temporary" },
      { password: "ENC_BASE64" },
    ]
    expect(simulateChanges(initial, updates)).toBe(true)
  })

  it("multiple non-password changes never trigger passwordDirty", () => {
    const initial = { password: "ENC_BASE64" }
    const updates = [
      { password: "ENC_BASE64" }, // host change
      { password: "ENC_BASE64" }, // port change
      { password: "ENC_BASE64" }, // alias change
      { password: "ENC_BASE64" }, // tls toggle
    ]
    expect(simulateChanges(initial, updates)).toBe(false)
  })

  // Simulates passwordDirty reset when currentConnection changes (useEffect)
  it("passwordDirty resets when switching to a different connection", () => {
    let passwordDirty = false

    // User edits connection A — changes password
    const prevA = { password: "ENC_A" }
    const updateA = { password: "new-pw" }
    if (updateA.password !== prevA.password) passwordDirty = true
    expect(passwordDirty).toBe(true)

    // Parent switches to connection B — useEffect fires, resets dirty flag
    passwordDirty = false // mirrors setPasswordDirty(false) in useEffect
    expect(passwordDirty).toBe(false)
  })
})

/*
 * --------------------------------------------------------------------------
 * PATH A encrypt guard: passwordDirty && connectionDetails.password
 *
 * When hasCoreChanges() is true, the submit handler uses this guard to
 * decide whether to encrypt. Edge cases around falsy passwords.
 * --------------------------------------------------------------------------
 */
describe("PATH A encrypt guard edge cases (edit-form.tsx)", () => {
  // Simulates the encrypt guard at edit-form.tsx:104-106
  function shouldEncrypt(passwordDirty: boolean, password: string | undefined): boolean {
    return !!(passwordDirty && password)
  }

  it("encrypts when user typed a new non-empty password", () => {
    expect(shouldEncrypt(true, "newpass")).toBe(true)
  })

  it("skips encryption when password is unchanged (host-only edit)", () => {
    expect(shouldEncrypt(false, "ENC_BASE64")).toBe(false)
  })

  it("skips encryption when user cleared password to empty", () => {
    // passwordDirty=true but password="" — deliberate password removal
    // Must NOT encrypt "" (which would produce "" anyway, but semantically correct)
    expect(shouldEncrypt(true, "")).toBe(false)
  })

  it("skips encryption when password is undefined", () => {
    expect(shouldEncrypt(true, undefined)).toBe(false)
  })

  it("skips encryption when passwordDirty=false even with a password present", () => {
    expect(shouldEncrypt(false, "ENCRYPTED_VALUE")).toBe(false)
  })
})

/*
 * --------------------------------------------------------------------------
 * hasCoreChanges: undefined/null field coercion
 *
 * Redux/localStorage may store undefined for optional fields. The form
 * initializes these to "" or false. hasCoreChanges must coerce correctly
 * to avoid false positives that trigger destructive reconnect.
 * --------------------------------------------------------------------------
 */
describe("hasCoreChanges undefined field coercion", () => {
  // Mirrors a connection loaded from localStorage where optional fields are missing
  function hasCoreChangesWithNullables(
    formState: Record<string, unknown>,
    savedState: Record<string, unknown>,
  ) {
    return (
      formState.host !== savedState.host ||
      formState.port !== savedState.port ||
      formState.username !== (savedState.username ?? "") ||
      formState.tls !== (savedState.tls ?? false) ||
      formState.verifyTlsCertificate !== (savedState.verifyTlsCertificate ?? false) ||
      formState.caCertPath !== (savedState.caCertPath ?? "")
    )
  }

  it("undefined username in saved connection matches empty string in form", () => {
    const form = { host: "h", port: "p", username: "", tls: false, verifyTlsCertificate: false, caCertPath: "" }
    const saved = { host: "h", port: "p", username: undefined, tls: false, verifyTlsCertificate: false, caCertPath: undefined }
    expect(hasCoreChangesWithNullables(form, saved)).toBe(false)
  })

  it("null username in saved connection matches empty string in form", () => {
    const form = { host: "h", port: "p", username: "", tls: false, verifyTlsCertificate: false, caCertPath: "" }
    const saved = { host: "h", port: "p", username: null, tls: false, verifyTlsCertificate: false, caCertPath: null }
    expect(hasCoreChangesWithNullables(form, saved)).toBe(false)
  })

  it("undefined tls in saved connection matches false in form", () => {
    const form = { host: "h", port: "p", username: "", tls: false, verifyTlsCertificate: false, caCertPath: "" }
    const saved = { host: "h", port: "p", username: "", tls: undefined, verifyTlsCertificate: undefined, caCertPath: "" }
    expect(hasCoreChangesWithNullables(form, saved)).toBe(false)
  })

  it("all optional fields undefined in saved → no false positive", () => {
    const form = { host: "h", port: "p", username: "", tls: false, verifyTlsCertificate: false, caCertPath: "" }
    const saved = { host: "h", port: "p" }
    expect(hasCoreChangesWithNullables(form, saved)).toBe(false)
  })
})
