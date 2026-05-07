export interface ShortcutDefinition {
  id: string
  group: 'General' | 'Editor' | 'Formatting' | 'Notes' | 'Folders' | 'Search' | 'Tables' | 'Attachments'
  label: string
  defaultCombo: string
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'newNote', group: 'Notes', label: 'New note', defaultCombo: 'Ctrl+N' },
  { id: 'newFolder', group: 'Folders', label: 'New folder', defaultCombo: 'Ctrl+Shift+N' },
  { id: 'search', group: 'Search', label: 'Search notes', defaultCombo: 'Ctrl+F' },
  { id: 'settings', group: 'General', label: 'Open settings', defaultCombo: 'Ctrl+,' },
  { id: 'exportPdf', group: 'Notes', label: 'Export note as PDF', defaultCombo: 'Ctrl+P' },
  { id: 'duplicateNote', group: 'Notes', label: 'Duplicate note', defaultCombo: 'Ctrl+D' },
  { id: 'bold', group: 'Formatting', label: 'Bold', defaultCombo: 'Ctrl+B' },
  { id: 'italic', group: 'Formatting', label: 'Italic', defaultCombo: 'Ctrl+I' },
  { id: 'underline', group: 'Formatting', label: 'Underline', defaultCombo: 'Ctrl+U' },
  { id: 'strike', group: 'Formatting', label: 'Strikethrough', defaultCombo: 'Ctrl+Shift+X' },
  { id: 'bulletList', group: 'Formatting', label: 'Bullet list', defaultCombo: 'Ctrl+Shift+8' },
  { id: 'orderedList', group: 'Formatting', label: 'Numbered list', defaultCombo: 'Ctrl+Shift+7' },
  { id: 'checklist', group: 'Formatting', label: 'Checklist', defaultCombo: 'Ctrl+Shift+L' },
  { id: 'blockquote', group: 'Formatting', label: 'Block quote', defaultCombo: 'Ctrl+Shift+B' },
  { id: 'codeBlock', group: 'Editor', label: 'Code block', defaultCombo: 'Ctrl+Alt+C' },
  { id: 'insertTable', group: 'Tables', label: 'Insert table', defaultCombo: 'Ctrl+Alt+T' },
  { id: 'insertImage', group: 'Attachments', label: 'Insert image', defaultCombo: 'Ctrl+Shift+I' },
  { id: 'attachFile', group: 'Attachments', label: 'Attach file', defaultCombo: 'Ctrl+Shift+A' },
  { id: 'plainPaste', group: 'Editor', label: 'Paste as plain text', defaultCombo: 'Ctrl+Shift+V' },
  { id: 'toggleStats', group: 'Editor', label: 'Toggle note stats', defaultCombo: 'Ctrl+Shift+S' },
]

export const DEFAULT_SHORTCUTS: Record<string, string> = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map(shortcut => [shortcut.id, shortcut.defaultCombo])
)

export function getShortcut(shortcuts: Record<string, string> | null | undefined, id: string): string {
  return shortcuts?.[id] || DEFAULT_SHORTCUTS[id] || ''
}

export function shortcutTitle(label: string, shortcuts: Record<string, string> | null | undefined, id: string): string {
  const combo = getShortcut(shortcuts, id)
  return combo ? `${label} (${combo})` : label
}

type ShortcutKeyboardEvent = Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'key'>

export function eventToCombo(event: ShortcutKeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  const rawKey = event.key === ' ' ? 'Space' : event.key
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : normalizeKeyName(rawKey)
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) parts.push(key)
  return parts.join('+')
}

export function comboMatchesEvent(combo: string, event: ShortcutKeyboardEvent): boolean {
  return eventToCombo(event).toLowerCase() === combo.toLowerCase()
}

function normalizeKeyName(key: string): string {
  const map: Record<string, string> = {
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  }
  return map[key] || key
}
