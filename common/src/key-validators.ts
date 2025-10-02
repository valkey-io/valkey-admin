interface ValidationData {
  keyName: string
  keyType: string
  value?: string
  ttl?: number
  hashFields?: Array<{ field: string; value: string }>
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
              isNotBlank(field.field) && isNotBlank(field.value)
            ).length === 0),
    error: "At least one field-value pair is required for hash type",
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
  "undefined": () => "Key type is required",
  "Select key type": () => "Please select a key type",
}
