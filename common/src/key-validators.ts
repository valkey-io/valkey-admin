interface ValidationData {
  keyName: string
  keyType: string
  value?: string
  ttl?: number
  hashFields?: Array<{ field: string; value: string }>
  listFields?: string[]
  setFields?: string[]
  zsetFields?: Array<{ key: string; value: string }>
  streamFields?: Array<{ field: string; value: string }>
}

interface ValidationRule {
  validatorFn: (key: ValidationData) => boolean
  error: string
}

const isBlank = (value: string | undefined | null): boolean =>
  !value || value.trim().length === 0

const isNotBlank = (value: string | undefined | null): boolean =>
  !isBlank(value)

const TtlSpec: ValidationRule[] = [
  {
    validatorFn: (key) => isNotBlank(key.ttl?.toString()) && (isNaN(key.ttl!) || key.ttl! < -1),
    error: "TTL is not a valid number (-1 for no expiration, or a positive number)",
  },
]

const BaseSpec: ValidationRule[] = [
  ...TtlSpec,
  { validatorFn: (key) => isBlank(key.keyName?.trim()), error: "Key name is required" },
]

export const StringSpec: ValidationRule[] = [
  ...BaseSpec,
  {
    validatorFn: (key) => key.keyType === "String" && isBlank(key.value),
    error: "Value is required for string type",
  },
]

export const HashSpec: ValidationRule[] = [
  ...BaseSpec,
  {
    validatorFn: (key) => key.keyType === "Hash" &&
      (!key.hashFields || key.hashFields.filter((field) =>
        isNotBlank(field.field) && isNotBlank(field.value),
      ).length === 0),
    error: "At least one field-value pair is required for hash type",
  },
]

export const ListSpec: ValidationRule[] = [
  ...BaseSpec,
  {
    validatorFn: (key) => key.keyType === "List" &&
      (!key.listFields || key.listFields.filter((field) =>
        isNotBlank(field),
      ).length === 0),
    error: "At least one value is required for list type",
  },
]

export const SetSpec: ValidationRule[] = [
  ...BaseSpec,
  {
    validatorFn: (key) => key.keyType === "Set" &&
      (!key.setFields || key.setFields.filter((field) =>
        isNotBlank(field),
      ).length === 0),
    error: "At least one value is required for set type",
  },
]

export const ZSetSpec: ValidationRule[] = [
  ...BaseSpec,
  {
    validatorFn: (key) => key.keyType === "ZSet" &&
      (!key.zsetFields || key.zsetFields.filter((field) =>
        isNotBlank(field.key) && isNotBlank(field.value),
      ).length === 0),
    error: "At least one key-value (member-score) pair is required for zset type",
  },
  {
    validatorFn: (key) => key.keyType === "ZSet" && key.zsetFields ?
      key.zsetFields.some((field) =>
        isNotBlank(field.key) && isNotBlank(field.value) && isNaN(parseFloat(field.value)),
      ) : false,
    error: "All score values must be valid numbers for zset type",
  },
]

export const StreamSpec: ValidationRule[] = [
  ...BaseSpec,
  {
    validatorFn: (key) => key.keyType === "Stream" &&
      (!key.streamFields || key.streamFields.filter((field) =>
        isNotBlank(field.field) && isNotBlank(field.value),
      ).length === 0),
    error: "At least one field-value pair is required for stream type",
  },
]

export const validate = (spec: ValidationRule[]) => (key: ValidationData): string =>
  spec
    .filter(({ validatorFn }) => validatorFn(key))
    .reduce((acc, { error }) => acc ? `${acc}${error}; ` : `${error}; `, "")
    .trim()

// main validators
export const validators = {
  "String": validate(StringSpec),
  "Hash": validate(HashSpec),
  "List": validate(ListSpec),
  "Set": validate(SetSpec),
  "ZSet": validate(ZSetSpec),
  "Stream": validate(StreamSpec),
  "undefined": () => "Key type is required",
  "Select key type": () => "Please select a key type",
}
