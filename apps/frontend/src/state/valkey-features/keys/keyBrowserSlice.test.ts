import { describe, it, expect } from "vitest"
import keyBrowserReducer, {
  getKeysRequested,
  getKeysFulfilled,
  getKeysFailed,
  getKeyTypeRequested,
  getKeyTypeFulfilled,
  getKeyTypeFailed,
  deleteKeyRequested,
  deleteKeyFulfilled,
  deleteKeyFailed,
  addKeyRequested,
  addKeyFulfilled,
  addKeyFailed,
  updateKeyRequested,
  updateKeyFulfilled,
  updateKeyFailed,
  defaultConnectionState
} from "./keyBrowserSlice"

describe("keyBrowserSlice", () => {
  const initialState = {}

  describe("getKeysRequested", () => {
    it("should create connection state if not exists and set loading to true", () => {
      const state = keyBrowserReducer(
        initialState,
        getKeysRequested({ connectionId: "conn-1" }),
      )

      expect(state["conn-1"]).toBeDefined()
      expect(state["conn-1"].loading).toBe(true)
      expect(state["conn-1"].error).toBeNull()
    })

    it("should set loading to true and clear error for existing connection", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          loading: false,
          error: "Previous error",
        },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeysRequested({ connectionId: "conn-1" }),
      )

      expect(state["conn-1"].loading).toBe(true)
      expect(state["conn-1"].error).toBeNull()
    })
  })

  describe("getKeysFulfilled", () => {
    it("should store keys, cursor, totalKeys and set loading to false", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          loading: true,
        },
      }

      const keys = [
        { name: "key1", type: "String" },
        { name: "key2", type: "Hash" },
      ]

      const state = keyBrowserReducer(
        previousState,
        getKeysFulfilled({
          connectionId: "conn-1",
          keys,
          cursor: "123",
          totalKeys: 100,
        }),
      )

      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].keys).toEqual(keys)
      expect(state["conn-1"].cursor).toBe("123")
      expect(state["conn-1"].totalKeys).toBe(100)
    })
  })

  describe("getKeysFailed", () => {
    it("should set loading to false and store error", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          loading: true,
        },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeysFailed({
          connectionId: "conn-1",
          error: "Failed to fetch keys",
        }),
      )

      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].error).toBe("Failed to fetch keys")
    })
  })

  describe("getKeyTypeRequested", () => {
    it("should set key-specific loading state", () => {
      const previousState = {
        "conn-1": { ...defaultConnectionState },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeyTypeRequested({ connectionId: "conn-1", key: "mykey" }),
      )

      expect(state["conn-1"].keyTypeLoading["mykey"]).toBe(true)
    })

    it("should create connection state if not exists", () => {
      // First initialize the connection state properly
      let state = keyBrowserReducer(
        {},
        getKeysRequested({ connectionId: "conn-1" }),
      )

      // Then request key type
      state = keyBrowserReducer(
        state,
        getKeyTypeRequested({ connectionId: "conn-1", key: "mykey" }),
      )

      expect(state["conn-1"]).toBeDefined()
      expect(state["conn-1"].keyTypeLoading["mykey"]).toBe(true)
    })
  })

  describe("getKeyTypeFulfilled", () => {
    it("should update key type in keys array and clear loading", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keys: [{ name: "mykey" }],
          keyTypeLoading: { mykey: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeyTypeFulfilled({
          connectionId: "conn-1",
          key: "mykey",
          keyType: "String",
          ttl: -1,
          size: 100,
        }),
      )

      expect(state["conn-1"].keys[0].type).toBe("String")
      expect(state["conn-1"].keys[0].ttl).toBe(-1)
      expect(state["conn-1"].keys[0].size).toBe(100)
      expect(state["conn-1"].keyTypeLoading["mykey"]).toBeUndefined()
    })

    it("should update collection size if provided", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keys: [{ name: "mylist" }],
          keyTypeLoading: { mylist: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeyTypeFulfilled({
          connectionId: "conn-1",
          key: "mylist",
          keyType: "List",
          ttl: -1,
          size: 50,
          collectionSize: 10,
        }),
      )

      expect(state["conn-1"].keys[0].collectionSize).toBe(10)
    })
  })

  describe("getKeyTypeFailed", () => {
    it("should clear key loading state", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keyTypeLoading: { mykey: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeyTypeFailed({
          connectionId: "conn-1",
          key: "mykey",
          error: "Failed to get key type",
        }),
      )

      expect(state["conn-1"].keyTypeLoading["mykey"]).toBeUndefined()
    })
  })

  describe("deleteKeyRequested", () => {
    it("should set key-specific loading state", () => {
      const previousState = {
        "conn-1": defaultConnectionState,
      }

      const state = keyBrowserReducer(
        previousState,
        deleteKeyRequested({ connectionId: "conn-1", key: "key-to-delete" }),
      )

      expect(state["conn-1"].keyTypeLoading["key-to-delete"]).toBe(true)
    })
  })

  describe("deleteKeyFulfilled", () => {
    it("should remove key from keys array when deleted is true", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keys: [
            { name: "key1", type: "String" },
            { name: "key2", type: "Hash" },
            { name: "key3", type: "Set" },
          ],
          keyTypeLoading: { key2: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        deleteKeyFulfilled({
          connectionId: "conn-1",
          key: "key2",
          deleted: true,
        }),
      )

      expect(state["conn-1"].keys).toHaveLength(2)
      expect(state["conn-1"].keys.find((k) => k.name === "key2")).toBeUndefined()
      expect(state["conn-1"].keyTypeLoading["key2"]).toBeUndefined()
    })

    it("should not remove key if deleted is false", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keys: [{ name: "key1", type: "String" }],
          keyTypeLoading: { key1: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        deleteKeyFulfilled({
          connectionId: "conn-1",
          key: "key1",
          deleted: false,
        }),
      )

      expect(state["conn-1"].keys).toHaveLength(1)
      expect(state["conn-1"].keyTypeLoading["key1"]).toBeUndefined()
    })
  })

  describe("deleteKeyFailed", () => {
    it("should clear key loading state", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keyTypeLoading: { mykey: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        deleteKeyFailed({
          connectionId: "conn-1",
          key: "mykey",
          error: "Delete failed",
        }),
      )

      expect(state["conn-1"].keyTypeLoading["mykey"]).toBeUndefined()
    })
  })

  describe("addKeyRequested", () => {
    it("should set loading to true and clear error", () => {
      const previousState = {
        "conn-1": defaultConnectionState,
      }

      const state = keyBrowserReducer(
        previousState,
        addKeyRequested({
          connectionId: "conn-1",
          key: "newkey",
          keyType: "String",
          value: "test",
        }),
      )

      expect(state["conn-1"].loading).toBe(true)
      expect(state["conn-1"].error).toBeNull()
    })
  })

  describe("addKeyFulfilled", () => {
    it("should add new key to keys array and set loading to false", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keys: [{ name: "existing-key", type: "String" }],
          loading: true,
        },
      }

      const newKey = { name: "new-key", type: "Hash", ttl: -1 }

      const state = keyBrowserReducer(
        previousState,
        addKeyFulfilled({
          connectionId: "conn-1",
          key: newKey,
          message: "Key added",
        }),
      )

      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].keys).toHaveLength(2)
      expect(state["conn-1"].keys[1]).toEqual(newKey)
    })
  })

  describe("addKeyFailed", () => {
    it("should set loading to false and store error", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          loading: true,
        },
      }

      const state = keyBrowserReducer(
        previousState,
        addKeyFailed({
          connectionId: "conn-1",
          error: "Key already exists",
        }),
      )

      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].error).toBe("Key already exists")
    })
  })

  describe("updateKeyRequested", () => {
    it("should set loading to true and clear error", () => {
      const previousState = {
        "conn-1": defaultConnectionState,
      }

      const state = keyBrowserReducer(
        previousState,
        updateKeyRequested({
          connectionId: "conn-1",
          key: "mykey",
          keyType: "String",
          value: "updated",
        }),
      )

      expect(state["conn-1"].loading).toBe(true)
      expect(state["conn-1"].error).toBeNull()
    })
  })

  describe("updateKeyFulfilled", () => {
    it("should update existing key in keys array and set loading to false", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keys: [
            { name: "key1", type: "String", ttl: -1 },
            { name: "key2", type: "Hash", ttl: 3600 },
          ],
          loading: true,
        },
      }

      const updatedKey = { name: "key2", type: "Hash", ttl: 7200, size: 200 }

      const state = keyBrowserReducer(
        previousState,
        updateKeyFulfilled({
          connectionId: "conn-1",
          key: updatedKey,
          message: "Key updated",
        }),
      )

      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].keys[1]).toEqual(updatedKey)
    })

    it("should not modify keys array if key not found", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keys: [{ name: "key1", type: "String" }],
          loading: true,
        },
      }

      const updatedKey = { name: "nonexistent-key", type: "String" }

      const state = keyBrowserReducer(
        previousState,
        updateKeyFulfilled({
          connectionId: "conn-1",
          key: updatedKey,
          message: "Key updated",
        }),
      )

      expect(state["conn-1"].keys).toHaveLength(1)
      expect(state["conn-1"].keys[0].name).toBe("key1")
    })
  })

  describe("updateKeyFailed", () => {
    it("should set loading to false and store error", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          loading: true,
        },
      }

      const state = keyBrowserReducer(
        previousState,
        updateKeyFailed({
          connectionId: "conn-1",
          error: "Update failed",
        }),
      )

      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].error).toBe("Update failed")
    })
  })

  describe("per-connection state", () => {
    it("should handle multiple connections independently", () => {
      let state = keyBrowserReducer(
        initialState,
        getKeysRequested({ connectionId: "conn-1" }),
      )
      state = keyBrowserReducer(
        state,
        getKeysRequested({ connectionId: "conn-2" }),
      )

      state = keyBrowserReducer(
        state,
        getKeysFulfilled({
          connectionId: "conn-1",
          keys: [{ name: "key1" }],
          cursor: "0",
          totalKeys: 1,
        }),
      )

      state = keyBrowserReducer(
        state,
        getKeysFulfilled({
          connectionId: "conn-2",
          keys: [{ name: "key2" }, { name: "key3" }],
          cursor: "0",
          totalKeys: 2,
        }),
      )

      expect(state["conn-1"].keys).toHaveLength(1)
      expect(state["conn-2"].keys).toHaveLength(2)
      expect(state["conn-1"].keys[0].name).toBe("key1")
      expect(state["conn-2"].keys[0].name).toBe("key2")
    })
  })

  describe("CRUD flow", () => {
    it("should handle complete add, update, delete flow", () => {
      // Add key
      let state = keyBrowserReducer(
        initialState,
        addKeyRequested({
          connectionId: "conn-1",
          key: "mykey",
          keyType: "String",
          value: "value1",
        }),
      )
      expect(state["conn-1"].loading).toBe(true)

      state = keyBrowserReducer(
        state,
        addKeyFulfilled({
          connectionId: "conn-1",
          key: { name: "mykey", type: "String" },
          message: "Added",
        }),
      )
      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].keys).toHaveLength(1)

      // Update key
      state = keyBrowserReducer(
        state,
        updateKeyRequested({
          connectionId: "conn-1",
          key: "mykey",
          keyType: "String",
          value: "value2",
        }),
      )
      expect(state["conn-1"].loading).toBe(true)

      state = keyBrowserReducer(
        state,
        updateKeyFulfilled({
          connectionId: "conn-1",
          key: { name: "mykey", type: "String", size: 50 },
          message: "Updated",
        }),
      )
      expect(state["conn-1"].keys[0].size).toBe(50)

      // Delete key
      state = keyBrowserReducer(
        state,
        deleteKeyRequested({ connectionId: "conn-1", key: "mykey" }),
      )
      expect(state["conn-1"].keyTypeLoading["mykey"]).toBe(true)

      state = keyBrowserReducer(
        state,
        deleteKeyFulfilled({
          connectionId: "conn-1",
          key: "mykey",
          deleted: true,
        }),
      )
      expect(state["conn-1"].keys).toHaveLength(0)
    })
  })
})
