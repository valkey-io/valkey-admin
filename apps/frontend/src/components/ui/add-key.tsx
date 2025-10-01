import React, { useState } from "react"
import { Trash, X } from "lucide-react"
import { useParams } from "react-router"
import { Button } from "./button"
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!keyName) {
      setError("Key name is required")
      return
    }

    if (keyType === "Select key type") {
      setError("Please select a key type")
      return
    }

    if (keyType === "String" && !value) {
      setError("Value is required for string type")
      return
    }
    // Validate TTL
    const parsedTtl = ttl ? parseInt(ttl, 10) : undefined
    if (ttl && (isNaN(parsedTtl!) || parsedTtl! < -1)) {
      setError(
        "TTL not a valid number (-1 for no expiration, or positive number)"
      )
      return
    } else if (keyType === "Hash") {
      // this ensures at least one field-value pair is entered
      const validFields = hashFields.filter(
        (field) => field.field.trim() && field.value.trim()
      )

      if (validFields.length === 0) {
        setError("At least one field-value pair is required for hash type")
        return
      }
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
              <div className="mt-4 text-sm font-light w-full">
                <div className="flex flex-col gap-2">
                  <label htmlFor="value">Value *</label>
                  <textarea
                    className="border border-tw-dark-border rounded p-2 dark:bg-tw-dark-primary min-h-[100px]"
                    id="value"
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Enter value"
                    required
                    value={value}
                  />
                </div>
              </div>
            ) : keyType === "Select key type" ? (
              <div className="mt-2 text-sm font-light">Select a key type</div>
            ) : (
              <div className="flex flex-col w-full gap-2">
                {hashFields.map((field, index) => (
                  <div className="flex gap-4 items-start mt-4" key={index}>
                    <div className="text-sm font-light w-1/2">
                      <input
                        className="border border-tw-dark-border rounded p-2 dark:bg-tw-dark-primary w-full"
                        onChange={(e) =>
                          updateHashField(index, "field", e.target.value)
                        }
                        placeholder="Field"
                        value={field.field}
                      />
                    </div>
                    <div className="text-sm font-light w-1/2">
                      <input
                        className="border border-tw-dark-border rounded p-2 dark:bg-tw-dark-primary w-full"
                        onChange={(e) =>
                          updateHashField(index, "value", e.target.value)
                        }
                        placeholder="Value"
                        value={field.value}
                      />
                    </div>
                    {hashFields.length > 1 && (
                      <Button
                        className="mt-1"
                        onClick={() => removeHashField(index)}
                        variant={"destructiveGhost"}
                      >
                        <Trash size={14} />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="text-end">
                  <button
                    className="text-tw-primary hover:text-tw-dark-border font-light text-sm"
                    onClick={addHashField}
                    type="button"
                  >
                    + Add Field
                  </button>
                </div>
              </div>
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
              className="px-4 py-2 w-full bg-tw-primary text-white rounded hover:bg-tw-primary/90"
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
