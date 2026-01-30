import type { ValkeyCommand } from "@/types/valkey-commands"

export interface TextInsertionResult {
  newText: string;
  newCursorPosition: number;
}

export function insertCommandIntoText(
  currentText: string,
  cursorPosition: number,
  command: ValkeyCommand,
): TextInsertionResult {
  let commandStart = currentText.lastIndexOf("\n", cursorPosition - 1) + 1
  while (commandStart < currentText.length && /\s/.test(currentText[commandStart])) {
    commandStart++
  }

  let commandEnd = commandStart
  while (
    commandEnd < currentText.length &&
    /\S/.test(currentText[commandEnd]) &&
    currentText[commandEnd] !== "\n"
  ) {
    commandEnd++
  }

  let existingArgs = ""
  let argsStart = commandEnd

  while (argsStart < currentText.length && currentText[argsStart] === " ") {
    argsStart++
  }

  let lineEnd = currentText.indexOf("\n", argsStart)
  if (lineEnd === -1) lineEnd = currentText.length

  if (argsStart < lineEnd) {
    existingArgs = currentText.substring(argsStart, lineEnd)
  }

  let commandText = command.name

  if (existingArgs.trim()) {
    commandText += ` ${existingArgs}`
  }

  const beforeCommand = currentText.substring(0, commandStart)
  const afterLine = currentText.substring(lineEnd)
  const newText = beforeCommand + commandText + afterLine

  let newCursorPosition
  if (existingArgs.trim()) {
    newCursorPosition = commandStart + command.name.length + 1 + existingArgs.length
  } else {
    newCursorPosition = commandStart + command.name.length
  }

  return { newText, newCursorPosition }
}

export function extractCommandFromText(text: string, cursorPosition: number): string {
  const textBeforeCursor = text.substring(0, cursorPosition)
  const lineStart = textBeforeCursor.lastIndexOf("\n") + 1
  const currentLine = textBeforeCursor.substring(lineStart)
  const commandMatch = currentLine.match(/^\s*(\S*)/)
  return commandMatch ? commandMatch[1] : ""
}
