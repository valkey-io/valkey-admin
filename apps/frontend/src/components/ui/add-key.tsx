import React, { useState } from "react"
import { X } from "lucide-react"
import { useParams } from "react-router"
import { validators } from "@common/src/key-validators"
import * as R from "ramda"
import { HashFields, ListFields, StringFields } from "./add-key-types"
import { useAppDispatch } from "@/hooks/hooks"
import { addKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

interface AddNewKeyProps {
  onClose: () => void;
}

export default function AddNewKey({ onClose }: AddNewKeyProps) {
  const { id } = useParams()
  const dispatch = useAppDispatch()

  const [keyType, setKeyType] = useState("Select key type")
  const [keyName, setKeyName] = useState("")
  const [ttl, setTtl] = useState("")
  const [value, setValue] = useState("")
  const [error, setError] = useState("")
  const [hashFields, setHashFields] = useState([{ field: "", value: "" }])
  const [listFields, setListFields] = useState([""])

  const addHashField = () => {
    setHashFields([...hashFields, { field: "", value: "" }])
  }

  const removeHashField = (index: number) => {
    setHashFields(hashFields.filter((_, i) => i !== index))
  }

  const updateHashField = (
    index: number,
    key: "field" | "value",
    val: string
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const parsedTtl = ttl ? parseInt(ttl, 10) : undefined

    const validationData = {
      keyName,
      keyType,
      value,
      ttl: parsedTtl,
      hashFields: keyType === "Hash" ? hashFields : undefined,
      listFields: keyType === "List" ? listFields : undefined,
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

      if (keyType === "String") {
        dispatch(
          addKeyRequested({
            ...basePayload,
            value: value.trim(),
          })
        )
      } else if (keyType === "Hash") {
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
          })
        )
      } else if (keyType === "List") {
        // before dispatching, filtering out the empty fields
        const validFields = listFields
          .filter((field) => field.trim())
          .map((field) => field.trim())

        dispatch(
          addKeyRequested({
            ...basePayload,
            values: validFields,
          })
        )
      }

      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="w-1/3 h-2/3 p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg border flex flex-col">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Add Key</h2>
          <button className="hover:text-tw-primary" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form
          className="flex-1 flex flex-col justify-between overflow-y-auto"
          onSubmit={handleSubmit}
        >
          <div>
            <div className="flex w-full justify-between gap-4">
              <div className="mt-4 text-sm font-light w-1/2">
                <div className="flex flex-col gap-2">
                  <label>Select the type of key you want to add.</label>
                  <select
                    className="border border-tw-dark-border rounded p-2"
                    id="key-type"
                    onChange={(e) => setKeyType(e.target.value)}
                    value={keyType}
                  >
                    <option disabled>Select key type</option>
                    <option>String</option>
                    <option>Hash</option>
                    <option>List</option>
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
            {keyType === "String" ? (
              <StringFields setValue={setValue} value={value} />
            ) : keyType === "List" ? (
              <ListFields
                listFields={listFields}
                onAdd={addListField}
                onRemove={removeListField}
                setListFields={setListFields} />
            ) : keyType === "Hash" ? (
              <HashFields
                hashFields={hashFields}
                onAdd={addHashField}
                onRemove={removeHashField}
                onUpdate={updateHashField}
              />
            ) : (
              <div className="mt-2 text-sm font-light">Select a key type</div>
            )}

            {error && (
              <div className="mt-4 text-sm text-red-500 font-medium">
                {error}
              </div>
            )}
          </div>

          <div className="pt-2 text-sm flex gap-4">
            <button
              className="px-4 py-2 w-full bg-tw-primary text-white rounded hover:bg-tw-primary/90"
              disabled={keyType === "Select key type" || !keyName}
              type="submit"
            >
              Submit
            </button>
            <button
              className="px-4 py-2 w-full bg-tw-dark-border/50 text-white rounded hover:bg-tw-dark-border"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
