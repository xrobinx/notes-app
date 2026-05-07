import { create } from 'zustand'
import type { Folder } from '../types'

interface FoldersState {
  folders: Folder[]
  deletedFolders: Folder[]
  selectedFolderId: string | null | 'trash'
  load: () => Promise<void>
  loadTrash: () => Promise<void>
  createFolder: (name: string, parentId?: string | null) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  restoreFolder: (id: string) => Promise<void>
  permanentDeleteFolder: (id: string) => Promise<void>
  moveFolder: (id: string, parentId: string | null) => Promise<void>
  reorderFolders: (folderIds: string[], parentId?: string | null) => Promise<void>
  selectFolder: (id: string | null | 'trash') => void
}

export const useFoldersStore = create<FoldersState>((set) => ({
  folders: [],
  deletedFolders: [],
  selectedFolderId: null,

  load: async () => {
    const folders = await window.api.folders.list()
    set({ folders })
  },

  loadTrash: async () => {
    const deletedFolders = await window.api.folders.trash()
    set({ deletedFolders })
  },

  createFolder: async (name, parentId) => {
    await window.api.folders.create(name, parentId)
    const folders = await window.api.folders.list()
    set({ folders })
  },

  renameFolder: async (id, name) => {
    await window.api.folders.update(id, { name })
    const folders = await window.api.folders.list()
    set({ folders })
  },

  deleteFolder: async (id) => {
    await window.api.folders.delete(id)
    const folders = await window.api.folders.list()
    set({ folders })
  },

  restoreFolder: async (id) => {
    await window.api.folders.restore(id)
    const [folders, deletedFolders] = await Promise.all([
      window.api.folders.list(),
      window.api.folders.trash()
    ])
    set({ folders, deletedFolders })
  },

  permanentDeleteFolder: async (id) => {
    await window.api.folders.permanentDelete(id)
    const deletedFolders = await window.api.folders.trash()
    set({ deletedFolders })
  },

  moveFolder: async (id, parentId) => {
    await window.api.folders.move(id, parentId)
    const folders = await window.api.folders.list()
    set({ folders })
  },

  reorderFolders: async (folderIds, parentId) => {
    await window.api.folders.reorder(folderIds, parentId)
    const folders = await window.api.folders.list()
    set({ folders })
  },

  selectFolder: (id) => {
    set({ selectedFolderId: id })
  }
}))
