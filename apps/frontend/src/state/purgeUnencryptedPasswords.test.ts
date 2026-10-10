import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import { LOCAL_STORAGE, NOT_CONNECTED, VALKEY } from "@common/src/constants"
import connectionReducer, {
  stripUnencryptedPassword,
  stripUnencryptedPasswords,
  type ConnectionState
} from "./valkey-features/connection/connectionSlice"
import { purgeUnencryptedPasswords } from "./purgeUnencryptedPasswords"

const conn = (password: string | undefined, isPasswordEncrypted?: boolean): ConnectionState => ({
  status: NOT_CONNECTED,
  errorMessage: null,
  searchableText: "",
  connectionDetails: {
    host: "localhost", port: "6379", username: "user", password,
    tls: false, verifyTlsCertificate: false, endpointType: "node", db: 0,
  },
  ...(isPasswordEncrypted === undefined ? {} : { isPasswordEncrypted }),
})

const saved = {
  legacy: conn("cleartext"),
  unencrypted: conn("cleartext", false),
  encrypted: conn("ciphertext", true),
  noPassword: conn(undefined),
}

const makeStore = () => configureStore({
  reducer: { [VALKEY.CONNECTION.name]: connectionReducer },
  preloadedState: { [VALKEY.CONNECTION.name]: { connections: structuredClone(saved) } },
})

const passwords = (connections: Record<string, ConnectionState>) =>
  Object.fromEntries(Object.entries(connections).map(([id, c]) => [id, c.connectionDetails.password]))

const expected = { legacy: undefined, unencrypted: undefined, encrypted: "ciphertext", noPassword: undefined }

describe("stripUnencryptedPassword", () => {
  it("drops passwords that are unmarked or marked unencrypted", () => {
    expect(stripUnencryptedPassword(saved.legacy).connectionDetails.password).toBeUndefined()
    expect(stripUnencryptedPassword(saved.unencrypted).connectionDetails.password).toBeUndefined()
  })

  it("keeps encrypted passwords and leaves passwordless connections unchanged", () => {
    expect(stripUnencryptedPassword(saved.encrypted)).toBe(saved.encrypted)
    expect(stripUnencryptedPassword(saved.noPassword)).toBe(saved.noPassword)
  })
})

describe("stripUnencryptedPasswords reducer", () => {
  it("strips every connection in state", () => {
    const state = connectionReducer({ connections: structuredClone(saved) }, stripUnencryptedPasswords())
    expect(passwords(state.connections)).toEqual(expected)
  })
})

describe("purgeUnencryptedPasswords", () => {
  beforeEach(() => {
    localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, JSON.stringify(saved))
  })

  afterEach(() => {
    localStorage.clear()
    delete window.secureStorage
  })

  const mockElectron = (encryptionAvailable: boolean) => {
    window.secureStorage = {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      isEncryptionAvailable: vi.fn().mockResolvedValue(encryptionAvailable),
    }
  }

  const stored = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE.VALKEY_CONNECTIONS)!)

  it("strips state and localStorage in Electron with no keystore", async () => {
    mockElectron(false)
    const store = makeStore()

    await purgeUnencryptedPasswords(store)

    expect(passwords(store.getState()[VALKEY.CONNECTION.name].connections)).toEqual(expected)
    expect(passwords(stored())).toEqual(expected)
  })

  it("changes nothing in Electron when a keystore is available", async () => {
    mockElectron(true)
    const store = makeStore()

    await purgeUnencryptedPasswords(store)

    expect(store.getState()[VALKEY.CONNECTION.name].connections).toEqual(saved)
    expect(stored()).toEqual(JSON.parse(JSON.stringify(saved)))
  })

  it("changes nothing in Web mode", async () => {
    const store = makeStore()

    await purgeUnencryptedPasswords(store)

    expect(store.getState()[VALKEY.CONNECTION.name].connections).toEqual(saved)
    expect(stored()).toEqual(JSON.parse(JSON.stringify(saved)))
  })
})
