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
  getKeyElementsRequested,
  getKeyElementsFulfilled,
  getKeyElementsFailed,
  defaultConnectionState
} from "./keyBrowserSlice"
import { connectionBroken } from "@/state/valkey-features/connection/connectionSlice"

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
          name: "mykey",
          type: "string",
          ttl: -1,
          size: 100,
          elements: "myvalue",
        }),
      )

      expect(state["conn-1"].keys[0].type).toBe("string")
      expect(state["conn-1"].keys[0].ttl).toBe(-1)
      expect(state["conn-1"].keys[0].size).toBe(100)
      expect(state["conn-1"].keys[0].elements).toBe("myvalue")
      expect(state["conn-1"].keyTypeLoading["mykey"]).toBeUndefined()
    })

    it("should add the key when it is not already in the keys array", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keyTypeLoading: { hotkey: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeyTypeFulfilled({
          connectionId: "conn-1",
          key: "hotkey",
          name: "hotkey",
          type: "string",
          ttl: -1,
          size: 56,
          elements: "hotvalue",
        }),
      )

      expect(state["conn-1"].keys).toEqual([
        { name: "hotkey", type: "string", ttl: -1, size: 56, elements: "hotvalue" },
      ])
      expect(state["conn-1"].keyTypeLoading["hotkey"]).toBeUndefined()
    })

    it("should store elementsWarning when the value is too large to display", () => {
      const previousState = {
        "conn-1": {
          ...defaultConnectionState,
          keyTypeLoading: { bigkey: true },
        },
      }

      const state = keyBrowserReducer(
        previousState,
        getKeyTypeFulfilled({
          connectionId: "conn-1",
          key: "bigkey",
          name: "bigkey",
          type: "list",
          ttl: -1,
          size: 99999999,
          collectionSize: 1000,
          elementsWarning: "too big",
        }),
      )

      expect(state["conn-1"].keys[0].elementsWarning).toBe("too big")
      expect(state["conn-1"].keys[0].elements).toBeUndefined()
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
          name: "mylist",
          type: "list",
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
    it("should set loading to false without storing the error in the key list banner", () => {
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
      expect(state["conn-1"].error).toBeNull()
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

  describe("getKeyElements", () => {
    const stateWithKey = (key: { type: string; elements: unknown[]; cursor?: string }) => ({
      "conn-1": {
        ...defaultConnectionState,
        keys: [{ name: "k", collectionSize: 10, ...key }],
        elementsLoading: { k: true },
      },
    })

    it("marks the key as loading when more elements are requested", () => {
      const state = keyBrowserReducer(
        initialState,
        getKeyElementsRequested({ connectionId: "conn-1", key: "k", keyType: "list", cursor: "50" }),
      )

      expect(state["conn-1"].elementsLoading["k"]).toBe(true)
    })

    it("appends the page, stores the next cursor and total, and clears loading", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "list", elements: ["a", "b"], cursor: "2" }),
        getKeyElementsFulfilled({
          connectionId: "conn-1",
          key: "k",
          cursor: "2",
          nextCursor: "4",
          elements: ["c", "d"],
          collectionSize: 12,
        }),
      )

      expect(state["conn-1"].keys[0].elements).toEqual(["a", "b", "c", "d"])
      expect(state["conn-1"].keys[0].cursor).toBe("4")
      expect(state["conn-1"].keys[0].collectionSize).toBe(12)
      expect(state["conn-1"].elementsLoading["k"]).toBeUndefined()
    })

    it("clears the cursor when the last page arrives", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "list", elements: ["a"], cursor: "1" }),
        getKeyElementsFulfilled({ connectionId: "conn-1", key: "k", cursor: "1", elements: ["b"], collectionSize: 2 }),
      )

      expect(state["conn-1"].keys[0].cursor).toBeUndefined()
    })

    it("keeps repeated values in lists", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "list", elements: ["a", "b"], cursor: "2" }),
        getKeyElementsFulfilled({ connectionId: "conn-1", key: "k", cursor: "2", elements: ["a", "b"], collectionSize: 4 }),
      )

      expect(state["conn-1"].keys[0].elements).toEqual(["a", "b", "a", "b"])
    })

    it("drops hash fields that are already loaded", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "hash", elements: [{ key: "f1", value: "v1" }], cursor: "7" }),
        getKeyElementsFulfilled({
          connectionId: "conn-1",
          key: "k",
          cursor: "7",
          elements: [{ key: "f1", value: "v1" }, { key: "f2", value: "v2" }],
          collectionSize: 2,
        }),
      )

      expect(state["conn-1"].keys[0].elements).toEqual([{ key: "f1", value: "v1" }, { key: "f2", value: "v2" }])
    })

    it("drops set members that are already loaded", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "set", elements: ["a", "b"], cursor: "7" }),
        getKeyElementsFulfilled({ connectionId: "conn-1", key: "k", cursor: "7", elements: ["b", "c"], collectionSize: 3 }),
      )

      expect(state["conn-1"].keys[0].elements).toEqual(["a", "b", "c"])
    })

    it("drops sorted set members that are already loaded", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "zset", elements: [{ key: "m1", value: 1 }], cursor: "1" }),
        getKeyElementsFulfilled({
          connectionId: "conn-1",
          key: "k",
          cursor: "1",
          elements: [{ key: "m1", value: 1 }, { key: "m2", value: 2 }],
          collectionSize: 2,
        }),
      )

      expect(state["conn-1"].keys[0].elements).toEqual([{ key: "m1", value: 1 }, { key: "m2", value: 2 }])
    })

    it("ignores a page for a cursor that is no longer current", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "list", elements: ["a", "b", "c", "d"], cursor: "100" }),
        getKeyElementsFulfilled({ connectionId: "conn-1", key: "k", cursor: "50", nextCursor: "52", elements: ["x", "y"], collectionSize: 200 }),
      )

      expect(state["conn-1"].keys[0].elements).toEqual(["a", "b", "c", "d"])
      expect(state["conn-1"].keys[0].cursor).toBe("100")
      expect(state["conn-1"].keys[0].collectionSize).toBe(10)
      expect(state["conn-1"].elementsLoading["k"]).toBeUndefined()
    })

    it("clears loading when the request fails", () => {
      const state = keyBrowserReducer(
        stateWithKey({ type: "list", elements: ["a"], cursor: "1" }),
        getKeyElementsFailed({ connectionId: "conn-1", key: "k", error: "boom" }),
      )

      expect(state["conn-1"].elementsLoading["k"]).toBeUndefined()
      expect(state["conn-1"].keys[0].elements).toEqual(["a"])
    })

    it("clears loading for only the broken connection when the socket drops", () => {
      const previousState = {
        "conn-1": { ...defaultConnectionState, elementsLoading: { k: true } },
        "conn-2": { ...defaultConnectionState, elementsLoading: { k: true } },
      }

      const state = keyBrowserReducer(previousState, connectionBroken({ connectionId: "conn-1" }))

      expect(state["conn-1"].elementsLoading).toEqual({})
      expect(state["conn-2"].elementsLoading).toEqual({ k: true })
    })
  })
})
