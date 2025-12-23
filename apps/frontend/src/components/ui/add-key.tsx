import React, { useState } from "react"
import { X } from "lucide-react"
import { useParams } from "react-router"
import { useSelector } from "react-redux"
import { validators } from "@common/src/key-validators"
import * as R from "ramda"
import * as Dialog from "@radix-ui/react-dialog"
import { KEY_TYPES } from "@common/src/constants"
import { HashFields, ListFields, StringFields, SetFields, ZSetFields, StreamFields, JsonFields } from "./key-types"
import { useAppDispatch } from "@/hooks/hooks"
import { addKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { selectJsonModuleAvailable } from "@/state/valkey-features/connection/connectionSelectors"

interface AddNewKeyProps {
  onClose: () => void;
}

export default function AddNewKey({ onClose }: AddNewKeyProps) {
  const { id } = useParams()
  const dispatch = useAppDispatch()
  const jsonModuleAvailable = useSelector(selectJsonModuleAvailable(id!))

  const [keyType, setKeyType] = useState(KEY_TYPES.STRING)
  const [keyName, setKeyName] = useState("")
  const [ttl, setTtl] = useState("")
  const [value, setValue] = useState("")
  const [error, setError] = useState("")
  const [hashFields, setHashFields] = useState([{ field: "", value: "" }])
  const [listFields, setListFields] = useState([""])
  const [setFields, setSetFields] = useState([""])
  const [zsetFields, setZsetFields] = useState([{ key: "", value: "" }])
  const [streamFields, setStreamFields] = useState([{ field: "", value: "" }])
  const [streamEntryId, setStreamEntryId] = useState("")

  const addHashField = () => {
    setHashFields([...hashFields, { field: "", value: "" }])
  }

  const removeHashField = (index: number) => {
    setHashFields(hashFields.filter((_, i) => i !== index))
  }

  const updateHashField = (
    index: number,
    key: "field" | "value",
    val: string,
  ) => {
    const updated = [...hashFields]
    updated[index][key] = val
    setHashFields(updated)
  }

  const addListField = () => {
    setListFields([...listFields, ""])
  }

  const removeListField = (index: number) => {
    setListFields(listFields.filter((_, i) => i !== index))
  }

  const addSetField = () => {
    setSetFields([...setFields, ""])
  }
  const removeSetField = (index: number) => {
    setSetFields(setFields.filter((_, i) => i !== index))
  }

  const addZsetField = () => {
    setZsetFields([...zsetFields, { key: "", value: "" }])
  }

  const removeZsetField = (index: number) => {
    setZsetFields(zsetFields.filter((_, i) => i !== index))
  }

  const updateZsetField = (
    index: number,
    field: "key" | "value",
    val: string,
  ) => {
    const updated = [...zsetFields]
    updated[index][field] = val
    setZsetFields(updated)
  }

  const addStreamField = () => {
    setStreamFields([...streamFields, { field: "", value: "" }])
  }

  const removeStreamField = (index: number) => {
    setStreamFields(streamFields.filter((_, i) => i !== index))
  }

  const updateStreamField = (
    index: number,
    field: "field" | "value",
    val: string,
  ) => {
    const updated = [...streamFields]
    updated[index][field] = val
    setStreamFields(updated)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const parsedTtl = ttl ? parseInt(ttl, 10) : undefined

    const validationData = {
      keyName,
      keyType,
      value,
      ttl: parsedTtl,
      hashFields: keyType === KEY_TYPES.HASH ? hashFields : undefined,
      listFields: keyType === KEY_TYPES.LIST ? listFields : undefined,
      setFields: keyType === KEY_TYPES.SET ? setFields : undefined,
      zsetFields: keyType === KEY_TYPES.ZSET ? zsetFields : undefined,
      streamFields: keyType === KEY_TYPES.STREAM ? streamFields : undefined,
    }

    const validator = validators[keyType as keyof typeof validators] || validators["undefined"]

    // Validate
    const errors = validator(validationData)
    if (R.isNotEmpty(errors)) {

      return setError(errors)
    }

    // dispatching
    if (id) {
      const basePayload = {
        connectionId: id,
        key: keyName.trim(),
        keyType,
        ttl: parsedTtl && parsedTtl > 0 ? parsedTtl : undefined,
      }

      switch (keyType) {
        case KEY_TYPES.STRING:
          dispatch(
            addKeyRequested({
              ...basePayload,
              value: value.trim(),
            }),
          )
          break
        case KEY_TYPES.HASH: {
          // before dispatching, filtering out the empty fields
          const validFields = hashFields
            .filter((field) => field.field.trim() && field.value.trim())
            .map((field) => ({
              field: field.field.trim(),
              value: field.value.trim(),
            }))

          dispatch(
            addKeyRequested({
              ...basePayload,
              fields: validFields,
            }),
          )
          break
        }
        case KEY_TYPES.LIST: {
          // before dispatching, filtering out the empty fields
          const validFields = listFields
            .filter((field) => field.trim())
            .map((field) => field.trim())

          dispatch(
            addKeyRequested({
              ...basePayload,
              values: validFields,
            }),
          )
          break
        }
        case KEY_TYPES.SET: {
          // before dispatching, filtering out the empty fields
          const validFields = setFields
            .filter((field) => field.trim())
            .map((field) => field.trim())

          dispatch(
            addKeyRequested({
              ...basePayload,
              values: validFields,
            }),
          )
          break
        }
        case KEY_TYPES.ZSET: {
          // before dispatching, filtering out the empty fields and converting scores to numbers
          const validMembers = zsetFields
            .filter((field) => field.key.trim() && field.value.trim())
            .map((field) => ({
              key: field.key.trim(),
              value: parseFloat(field.value),
            }))

          dispatch(
            addKeyRequested({
              ...basePayload,
              zsetMembers: validMembers,
            }),
          )
          break
        }
        case KEY_TYPES.STREAM: {
          // before dispatching, filtering out the empty fields
          const validFields = streamFields
            .filter((field) => field.field.trim() && field.value.trim())
            .map((field) => ({
              field: field.field.trim(),
              value: field.value.trim(),
            }))

          dispatch(
            addKeyRequested({
              ...basePayload,
              fields: validFields,
              streamEntryId: streamEntryId.trim() || undefined,
            }),
          )
          break
        }
        case KEY_TYPES.JSON:
          dispatch(
            addKeyRequested({
              ...basePayload,
              value: value.trim(),
            }),
          )
          break
      }

      onClose()
    }
  }

  return (
    <Dialog.Root onOpenChange={onClose} open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="w-1/2 h-3/4 p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg 
            border flex flex-col">
              <div className="flex justify-between">
                <Dialog.Title className="text-lg font-semibold">Add Key</Dialog.Title>
                <Dialog.Close asChild>
                  <button className="hover:text-tw-primary">
                    <X size={20} />
                  </button>
                </Dialog.Close>
              </div>
              <form
                className="flex-1 flex flex-col min-h-0"
                onSubmit={handleSubmit}
              >
                <div className="flex-shrink-0">
                  <div className="flex w-full justify-between gap-4">
                    <div className="mt-4 text-sm font-light w-1/2">
                      <div className="flex flex-col gap-2">
                        <label>Select key type</label>
                        <select
                          className="border border-tw-dark-border rounded p-2"
                          id="key-type"
                          onChange={(e) => setKeyType(e.target.value)}
                          value={keyType}
                        >
                          <option>{KEY_TYPES.STRING}</option>
                          <option>{KEY_TYPES.HASH}</option>
                          <option>{KEY_TYPES.LIST}</option>
                          <option>{KEY_TYPES.SET}</option>
                          <option>{KEY_TYPES.ZSET}</option>
                          <option>{KEY_TYPES.STREAM}</option>
                          <option>{KEY_TYPES.JSON}</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-4 text-sm font-light w-1/2">
                      <div className="flex flex-col gap-2">
                        <label>TTL (seconds)</label>
                        <input
                          className="border border-tw-dark-border rounded p-2"
                          id="ttl"
                          onChange={(e) => setTtl(e.target.value)}
                          placeholder="Enter TTL, Default: -1 (no expiration)"
                          type="number"
                          value={ttl}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm font-light w-full">
                    <div className="flex flex-col gap-2">
                      <label>Key name *</label>
                      <input
                        className="border border-tw-dark-border rounded p-2"
                        id="key-name"
                        onChange={(e) => setKeyName(e.target.value)}
                        placeholder="Enter key name"
                        type="text"
                        value={keyName}
                      />
                    </div>
                  </div>
                  <div className="mt-6 text-sm font-semibold border-b border-tw-dark-border pb-2">
                    Key Elements
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {keyType === KEY_TYPES.STRING ? (
                    <StringFields setValue={setValue} value={value} />
                  ) : keyType === KEY_TYPES.LIST ? (
                    <ListFields
                      listFields={listFields}
                      onAdd={addListField}
                      onRemove={removeListField}
                      setListFields={setListFields} />
                  ) : keyType === KEY_TYPES.HASH ? (
                    <HashFields
                      hashFields={hashFields}
                      onAdd={addHashField}
                      onRemove={removeHashField}
                      onUpdate={updateHashField}
                    />
                  ) : keyType === KEY_TYPES.SET ? (
                    <SetFields
                      onAdd={addSetField}
                      onRemove={removeSetField}
                      setFields={setFields}
                      setSetFields={setSetFields}
                    />
                  ) : keyType === KEY_TYPES.ZSET ? (
                    <ZSetFields
                      onAdd={addZsetField}
                      onRemove={removeZsetField}
                      onUpdate={updateZsetField}
                      zsetFields={zsetFields}
                    />
                  ) : keyType === KEY_TYPES.STREAM ? (
                    <StreamFields
                      onAdd={addStreamField}
                      onEntryIdChange={setStreamEntryId}
                      onRemove={removeStreamField}
                      onUpdate={updateStreamField}
                      streamEntryId={streamEntryId}
                      streamFields={streamFields}
                    />
                  ) : keyType === KEY_TYPES.JSON ? (
                    <JsonFields jsonModuleAvailable={jsonModuleAvailable} setValue={setValue} value={value} />
                  ) : (
                    <div className="mt-2 text-sm font-light">Select a key type</div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {error && (
                    <div className="mt-4 text-sm text-red-500 font-medium">
                      {error}
                    </div>
                  )}

                  <div className="pt-2 text-sm flex gap-4">
                    <button
                      className="px-4 py-2 w-full bg-tw-primary text-white rounded hover:bg-tw-primary/90"
                      disabled={!keyName || (!jsonModuleAvailable && keyType === KEY_TYPES.JSON)}
                      type="submit"
                    >
                      Submit
                    </button>
                    <button
                      className="px-4 py-2 w-full bg-tw-dark-border/50 text-white rounded hover:bg-tw-dark-border"
                      onClick={onClose}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div></Dialog.Content></Dialog.Portal></Dialog.Root>
  )
}
