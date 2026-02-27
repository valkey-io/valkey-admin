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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"

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
                <Dialog.Title asChild>
                  <Typography variant="subheading">Add Key</Typography>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button className="hover:text-primary h-auto p-0" variant="ghost">
                    <X size={20} />
                  </Button>
                </Dialog.Close>
              </div>
              <form
                className="flex-1 flex flex-col min-h-0"
                onSubmit={handleSubmit}
              >
                <div className="flex-shrink-0">
                  <div className="flex w-full justify-between gap-4">
                    <div className="mt-4 text-sm w-1/2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="key-type">Select key type</Label>
                        <Select
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
                        </Select>
                      </div>
                    </div>
                    <div className="mt-4 text-sm w-1/2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ttl">TTL (seconds)</Label>
                        <Input
                          id="ttl"
                          onChange={(e) => setTtl(e.target.value)}
                          placeholder="Enter TTL, Default: -1 (no expiration)"
                          type="number"
                          value={ttl}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm w-full">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="key-name">Key name *</Label>
                      <Input
                        id="key-name"
                        onChange={(e) => setKeyName(e.target.value)}
                        placeholder="Enter key name"
                        type="text"
                        value={keyName}
                      />
                    </div>
                  </div>
                  <Typography className="mt-6 border-b border-tw-dark-border pb-2" variant="bodySm">
                    Key Elements
                  </Typography>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 px-1">
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
                    <Typography className="mt-2 text-gray-500" variant="bodySm">
                      Select a key type
                    </Typography>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {error && (
                    <Typography className="mt-4" variant="bodySm">
                      {error}
                    </Typography>
                  )}

                  <div className="pt-2 text-sm flex space-x-1">
                    <Button
                      className="w-1/2"
                      disabled={!keyName || (!jsonModuleAvailable && keyType === KEY_TYPES.JSON)}
                      type="submit"
                    >
                      Submit
                    </Button>
                    <Button
                      className="w-1/2"
                      onClick={onClose}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div></Dialog.Content></Dialog.Portal></Dialog.Root>
  )
}
