export const sanitizeUrl = (input: string) => input.replace(/[^a-zA-Z0-9_-]/g, "-")
