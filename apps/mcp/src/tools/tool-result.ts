// Wraps a tool's output as an MCP result: JSON text for clients that read text, and the same object as structured content.
export const toolResult = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: "text" as const, text: JSON.stringify(output) }],
  structuredContent: output,
})
