import { Trash, Check, TriangleAlert } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { Typography } from "../ui/typography"

interface StringFieldsProps {
  value: string
  setValue: (value: string) => void
}

export function StringFields({ value, setValue }: StringFieldsProps) {
  return (
    <div className="mt-4 text-sm w-full">
      <div className="flex flex-col gap-2">
        <Label htmlFor="value">Value *</Label>
        <Textarea
          className="min-h-[100px]"
          id="value"
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter value"
          required
          value={value}
        />
      </div>
    </div>
  )
}

interface ListFieldsProps {
  listFields: string[]
  setListFields: (fields: string[]) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function ListFields({ listFields, setListFields, onAdd, onRemove }: ListFieldsProps) {
  const updateField = (index: number, value: string) => {
    const updated = [...listFields]
    updated[index] = value
    setListFields(updated)
  }

  return (
    <div className="flex flex-col w-full gap-2">
      {listFields.map((field, index) => (
        <div className="flex gap-4 items-start mt-4" key={index}>
          <div className="text-sm w-full">
            <Input
              onChange={(e) => updateField(index, e.target.value)}
              placeholder="Value"
              value={field}
            />
          </div>
          {listFields.length > 1 && (
            <Button
              className="mt-1"
              onClick={() => onRemove(index)}
              size="icon"
              variant="destructiveGhost"
            >
              <Trash size={14} />
            </Button>
          )}
        </div>
      ))}
      <div className="text-end">
        <Button
          onClick={onAdd}
          type="button"
          variant="ghost"
        >
          + Add Value
        </Button>
      </div>
    </div>
  )
}

interface SetFieldsProps {
  setFields: string[]
  setSetFields: (fields: string[]) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function SetFields({ setFields, setSetFields, onAdd, onRemove }: SetFieldsProps) {
  const updateField = (index: number, value: string) => {
    const updated = [...setFields]
    updated[index] = value
    setSetFields(updated)
  }

  return (
    <div className="flex flex-col w-full gap-2">
      {setFields.map((field, index) => (
        <div className="flex gap-4 items-start mt-4" key={index}>
          <div className="text-sm w-full">
            <Input
              onChange={(e) => updateField(index, e.target.value)}
              placeholder="Value"
              value={field}
            />
          </div>
          {setFields.length > 1 && (
            <Button
              className="mt-1"
              onClick={() => onRemove(index)}
              size="icon"
              variant="destructiveGhost"
            >
              <Trash size={14} />
            </Button>
          )}
        </div>
      ))}
      <div className="text-end">
        <Button
          onClick={onAdd}
          type="button"
          variant="ghost"
        >
          + Add Value
        </Button>
      </div>
    </div>
  )
}

interface HashFieldsProps {
  hashFields: Array<{ field: string; value: string }>
  onUpdate: (index: number, key: "field" | "value", value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function HashFields({ hashFields, onUpdate, onAdd, onRemove }: HashFieldsProps) {
  return (
    <div className="flex flex-col w-full gap-2">
      {hashFields.map((field, index) => (
        <div className="flex gap-4 items-start mt-4" key={index}>
          <div className="text-sm w-1/2">
            <Input
              onChange={(e) => onUpdate(index, "field", e.target.value)}
              placeholder="Field"
              value={field.field}
            />
          </div>
          <div className="text-sm w-1/2">
            <Input
              onChange={(e) => onUpdate(index, "value", e.target.value)}
              placeholder="Value"
              value={field.value}
            />
          </div>
          {hashFields.length > 1 && (
            <Button
              className="mt-1"
              onClick={() => onRemove(index)}
              size="icon"
              variant="destructiveGhost"
            >
              <Trash size={14} />
            </Button>
          )}
        </div>
      ))}
      <div className="text-end">
        <Button
          onClick={onAdd}
          type="button"
          variant="ghost"
        >
          + Add Field
        </Button>
      </div>
    </div>
  )
}

interface ZSetFieldsProps {
  zsetFields: Array<{ key: string; value: string }>
  onUpdate: (index: number, field: "key" | "value", value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function ZSetFields({ zsetFields, onUpdate, onAdd, onRemove }: ZSetFieldsProps) {
  return (
    <div className="flex flex-col w-full gap-2">
      {zsetFields.map((field, index) => (
        <div className="flex gap-4 items-start mt-4" key={index}>
          <div className="text-sm w-1/2">
            <Input
              onChange={(e) => onUpdate(index, "key", e.target.value)}
              placeholder="Key (Member)"
              value={field.key}
            />
          </div>
          <div className="text-sm w-1/2">
            <Input
              onChange={(e) => onUpdate(index, "value", e.target.value)}
              placeholder="Value (Score)"
              step="any"
              type="number"
              value={field.value}
            />
          </div>
          {zsetFields.length > 1 && (
            <Button
              className="mt-1"
              onClick={() => onRemove(index)}
              size="icon"
              variant="destructiveGhost"
            >
              <Trash size={14} />
            </Button>
          )}
        </div>
      ))}
      <div className="text-end">
        <Button
          onClick={onAdd}
          type="button"
          variant="ghost"
        >
          + Add Member
        </Button>
      </div>
    </div>
  )
}

interface StreamFieldsProps {
  streamEntryId: string
  onEntryIdChange: (value: string) => void
  streamFields: Array<{ field: string; value: string }>
  onUpdate: (index: number, field: "field" | "value", value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function StreamFields({ streamEntryId, onEntryIdChange, streamFields, onUpdate, onAdd, onRemove }: StreamFieldsProps) {
  return (
    <div className="flex flex-col w-full gap-2">
      <div className="mt-4 text-sm w-full">
        <div className="flex flex-col gap-2">
          <Label htmlFor="stream-entry-id">Entry ID (leave empty for auto-generated)</Label>
          <Input
            id="stream-entry-id"
            onChange={(e) => onEntryIdChange(e.target.value)}
            placeholder="* (auto-generated)"
            type="text"
            value={streamEntryId}
          />
        </div>
      </div>
      {streamFields.map((field, index) => (
        <div className="flex gap-4 items-start mt-4" key={index}>
          <div className="text-sm w-1/2">
            <Input
              onChange={(e) => onUpdate(index, "field", e.target.value)}
              placeholder="Field"
              value={field.field}
            />
          </div>
          <div className="text-sm w-1/2">
            <Input
              onChange={(e) => onUpdate(index, "value", e.target.value)}
              placeholder="Value"
              value={field.value}
            />
          </div>
          {streamFields.length > 1 && (
            <Button
              className="mt-1"
              onClick={() => onRemove(index)}
              size="icon"
              variant="destructiveGhost"
            >
              <Trash size={14} />
            </Button>
          )}
        </div>
      ))}
      <div className="text-end">
        <Button
          onClick={onAdd}
          type="button"
          variant="ghost"
        >
          + Add Field
        </Button>
      </div>
    </div>
  )
}

interface JsonFieldsProps {
  value: string
  setValue: (value: string) => void
  jsonModuleAvailable?: boolean
}

export function JsonFields({ value, setValue, jsonModuleAvailable = false }: JsonFieldsProps) {
  return (
    <div className="mt-4 text-sm w-full">
      <div className="flex flex-col gap-2">
        <Label htmlFor="json-value">JSON Value *</Label>

        {/* JSON Module Indicator */}
        <div className={`flex gap-2 px-3 py-2 rounded bg-primary/20 ${
          jsonModuleAvailable
            ? "text-teal-500"
            : "text-red-400"
        }`}>
          {jsonModuleAvailable ? <Check size={14} /> : <TriangleAlert size={14} />}
          <Typography variant="bodyXs">
            {jsonModuleAvailable
              ? "JSON module is available"
              : "JSON module is not loaded on this Valkey instance"}
          </Typography>
        </div>

        <Textarea
          className="min-h-[150px] font-mono text-sm"
          id="json-value"
          onChange={(e) => setValue(e.target.value)}
          placeholder='Enter JSON (e.g., {"name": "John", "age": 30})'
          required
          value={value}
        />
        <Typography variant="bodyXs">Enter valid JSON data</Typography>
      </div>
    </div>
  )
}
