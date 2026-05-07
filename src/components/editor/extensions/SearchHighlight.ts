import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const searchHighlightKey = new PluginKey<{
  query: string
  decorations: DecorationSet
}>('searchHighlight')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchHighlight: (query: string) => ReturnType
    }
  }
}

function getSearchTerms(query: string): string[] {
  return Array.from(new Set(
    query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
  ))
}

export function findFirstSearchMatch(doc: ProseMirrorNode, query: string): { from: number; to: number } | null {
  return findSearchMatches(doc, query)[0] ?? null
}

export function findSearchMatches(doc: ProseMirrorNode, query: string): Array<{ from: number; to: number }> {
  const terms = getSearchTerms(query)
  if (terms.length === 0) return []

  const matches: Array<{ from: number; to: number }> = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true

    const text = node.text.toLowerCase()
    for (const term of terms) {
      let index = text.indexOf(term)
      while (index !== -1) {
        const from = pos + index
        const to = from + term.length
        if (!matches.some(match => from < match.to && to > match.from)) {
          matches.push({ from, to })
        }
        index = text.indexOf(term, index + term.length)
      }
    }

    return true
  })

  return matches.sort((a, b) => a.from - b.from)
}

function createDecorations(doc: ProseMirrorNode, query: string) {
  const terms = getSearchTerms(query)
  if (terms.length === 0) return DecorationSet.empty

  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true

    const text = node.text.toLowerCase()
    const ranges: Array<{ from: number; to: number }> = []

    for (const term of terms) {
      let index = text.indexOf(term)
      while (index !== -1) {
        const from = pos + index
        const to = from + term.length
        const overlaps = ranges.some(range => from < range.to && to > range.from)

        if (!overlaps) {
          ranges.push({ from, to })
          decorations.push(Decoration.inline(from, to, { class: 'search-result-highlight' }))
        }

        index = text.indexOf(term, index + term.length)
      }
    }

    return true
  })

  return DecorationSet.create(doc, decorations)
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addCommands() {
    return {
      setSearchHighlight: query => ({ dispatch, tr }) => {
        dispatch?.(tr.setMeta(searchHighlightKey, { query }))
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init: (_, state) => ({
            query: '',
            decorations: createDecorations(state.doc, ''),
          }),
          apply: (tr, value, _oldState, newState) => {
            const meta = tr.getMeta(searchHighlightKey) as { query?: string } | undefined
            const query = meta?.query ?? value.query
            if (!meta && !tr.docChanged) return value
            return { query, decorations: createDecorations(newState.doc, query) }
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
