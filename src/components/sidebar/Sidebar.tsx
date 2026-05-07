import { useEffect, useRef, useState } from 'react'
import {
  NotebookText, Star, Trash2,
  Plus, ChevronDown, ChevronRight, Folder,
  PanelLeftClose, PanelLeftOpen, Settings, Paperclip, CheckSquare, Lock
} from 'lucide-react'
import { useFoldersStore } from '../../store/foldersStore'
import { useNotesStore } from '../../store/notesStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { Folder as FolderType, Tag } from '../../types'
import './Sidebar.css'

interface Props {
  collapsed: boolean
  onToggle: () => void
  onOpenSettings: () => void
}

export function Sidebar({ collapsed, onToggle, onOpenSettings }: Props) {
  const { folders, selectedFolderId, load, createFolder, renameFolder, deleteFolder, selectFolder, moveFolder } = useFoldersStore()
  const { loadNotes, selectNote, moveNote } = useNotesStore()
  const { nickname } = useSettingsStore()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ folderId: string; x: number; y: number } | null>(null)
  const [deleteWarning, setDeleteWarning] = useState<{ id: string; name: string; noteCount: number; folderCount: number } | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.api.notes.tags().then(setTags).catch(() => setTags([]))
  }, [selectedFolderId])

  const handleSelectSection = (id: string | null | 'trash') => {
    selectFolder(id)
    if (id === 'trash') {
      loadNotes('trash')
    } else {
      loadNotes(id)
    }
    selectNote(null)
  }

  const handleNewFolder = async () => {
    const name = 'New Folder'
    await createFolder(name, null)
  }

  const handleRename = async (id: string) => {
    if (renameValue.trim()) {
      await renameFolder(id, renameValue.trim())
    }
    setRenamingId(null)
  }

  const startRename = (folder: FolderType) => {
    setRenamingId(folder.id)
    setRenameValue(folder.name)
    setContextMenu(null)
  }

  useEffect(() => {
    if (!renamingId || !renameInputRef.current) return
    requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }, [renamingId])

  const handleContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault()
    setContextMenu({ folderId, x: e.clientX, y: e.clientY })
  }

  const renderFolder = (folder: FolderType, depth = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const hasChildren = folder.children && folder.children.length > 0
    const isSelected = selectedFolderId === folder.id

    return (
      <div key={folder.id}>
        <div
          className={`sidebar-item sidebar-folder ${isSelected ? 'active' : ''}`}
          style={{ paddingLeft: collapsed ? '0' : depth === 0 ? '12px' : `${24 + (depth - 1) * 14}px` }}
          onClick={() => handleSelectSection(folder.id)}
          onContextMenu={(e) => handleContextMenu(e, folder.id)}
          draggable={!collapsed && renamingId !== folder.id}
          onDragStart={event => {
            event.dataTransfer.setData('application/x-folder-id', folder.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={event => {
            if (event.dataTransfer.types.includes('application/x-note-id') || event.dataTransfer.types.includes('application/x-folder-id')) event.preventDefault()
          }}
          onDrop={async event => {
            event.preventDefault()
            const noteId = event.dataTransfer.getData('application/x-note-id')
            const draggedFolderId = event.dataTransfer.getData('application/x-folder-id')
            if (noteId) {
              await moveNote(noteId, folder.id)
              if (selectedFolderId !== null && selectedFolderId !== 'trash' && selectedFolderId !== 'pinned') void loadNotes(selectedFolderId)
            } else if (draggedFolderId && draggedFolderId !== folder.id) {
              await moveFolder(draggedFolderId, folder.id)
            }
          }}
          title={collapsed ? folder.name : undefined}
        >
          <Folder size={collapsed ? 18 : 15} className="sidebar-icon" />
          {!collapsed && (
            renamingId === folder.id ? (
              <input
                ref={renameInputRef}
                className="folder-rename-input"
                value={renameValue}
                autoFocus
                type="text"
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => handleRename(folder.id)}
                onKeyDown={e => {
                  e.stopPropagation()
                  if (e.key === 'Enter') handleRename(folder.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="sidebar-label">{folder.name}</span>
            )
          )}
          {!collapsed && hasChildren && (
            <button
              className="folder-expand-btn"
              onClick={(e) => {
                e.stopPropagation()
                setExpandedFolders(prev => {
                  const next = new Set(prev)
                  if (next.has(folder.id)) next.delete(folder.id)
                  else next.add(folder.id)
                  return next
                })
              }}
              title={isExpanded ? 'Collapse folder' : 'Expand folder'}
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
        </div>
        {!collapsed && isExpanded && hasChildren && folder.children!.map(child => renderFolder(child, depth + 1))}
      </div>
    )
  }

  return (
    <>
      <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-top-row">
          {!collapsed && nickname && (
            <div className="sidebar-greeting">
              <span>{getGreeting()},</span>
              <strong>{nickname}</strong>
            </div>
          )}
          <button
            className="sidebar-toggle-btn"
            onClick={onToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <div className="sidebar-sections">
          {/* All Notes */}
          <div
            className={`sidebar-item ${selectedFolderId === null ? 'active' : ''}`}
            onClick={() => handleSelectSection(null)}
            onDragOver={event => {
              if (event.dataTransfer.types.includes('application/x-note-id')) event.preventDefault()
            }}
            onDrop={async event => {
              const noteId = event.dataTransfer.getData('application/x-note-id')
              if (noteId) await moveNote(noteId, null)
            }}
            title={collapsed ? 'All Notes' : undefined}
          >
            <NotebookText size={collapsed ? 18 : 16} className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">All Notes</span>}
          </div>

          {/* Pinned */}
          <div
            className={`sidebar-item ${selectedFolderId === 'pinned' ? 'active' : ''}`}
            onClick={() => handleSelectSection('pinned' as string)}
            title={collapsed ? 'Pinned' : undefined}
          >
            <Star size={collapsed ? 18 : 16} className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Pinned</span>}
          </div>

          {!collapsed && <div className="sidebar-section-divider" />}

          {!collapsed && (
            <div className="sidebar-section-header">
              <span>Smart</span>
            </div>
          )}
          {[
            ['smart:attachments', 'Attachments', Paperclip],
            ['smart:checklists', 'Checklists', CheckSquare],
            ['smart:locked', 'Locked', Lock],
          ].map(([id, label, Icon]) => (
            <div
              key={id as string}
              className={`sidebar-item ${selectedFolderId === id ? 'active' : ''}`}
              onClick={() => handleSelectSection(id as string)}
              title={collapsed ? label as string : undefined}
            >
              <Icon size={collapsed ? 18 : 16} className="sidebar-icon" />
              {!collapsed && <span className="sidebar-label">{label as string}</span>}
            </div>
          ))}

          {!collapsed && <div className="sidebar-section-divider" />}

          {/* Folders */}
          {!collapsed && (
            <div className="sidebar-section-header">
              <span>Folders</span>
              <button className="sidebar-add-btn" onClick={handleNewFolder} title="New folder">
                <Plus size={14} />
              </button>
            </div>
          )}
          {collapsed && (
            <button className="sidebar-item" onClick={handleNewFolder} title="New folder">
              <Plus size={18} className="sidebar-icon" />
            </button>
          )}

          <div className="sidebar-folder-list">
            {folders.map(f => renderFolder(f))}
          </div>

          {!collapsed && tags.length > 0 && (
            <>
              <div className="sidebar-section-divider" />
              <div className="sidebar-section-header">
                <span>Tags</span>
              </div>
              {tags.map(tag => (
                <div
                  key={tag.name}
                  className={`sidebar-item ${selectedFolderId === `tag:${tag.name}` ? 'active' : ''}`}
                  onClick={() => handleSelectSection(`tag:${tag.name}`)}
                >
                  <span className="sidebar-tag-symbol">#</span>
                  <span className="sidebar-label">{tag.name}</span>
                  <span className="sidebar-count">{tag.noteCount}</span>
                </div>
              ))}
            </>
          )}

          {!collapsed && <div className="sidebar-section-divider" />}

          {/* Trash */}
          <div
            className={`sidebar-item ${selectedFolderId === 'trash' ? 'active' : ''}`}
            onClick={() => handleSelectSection('trash')}
            title={collapsed ? 'Recently Deleted' : undefined}
          >
            <Trash2 size={collapsed ? 18 : 16} className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Recently Deleted</span>}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className="sidebar-item sidebar-settings-btn"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings size={collapsed ? 18 : 16} className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Settings</span>}
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu scale-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button onClick={() => {
            const folder = findFolder(folders, contextMenu.folderId)
            if (folder) startRename(folder)
          }}>Rename</button>
          <button className="danger" onClick={async () => {
            const info = await window.api.folders.deleteInfo(contextMenu.folderId)
            setContextMenu(null)
            if (info && (info.noteCount > 0 || info.folderCount > 0)) {
              setDeleteWarning(info)
            } else {
              await deleteFolder(contextMenu.folderId)
              if (selectedFolderId === contextMenu.folderId) handleSelectSection(null)
            }
          }}>Delete Folder</button>
        </div>
      )}
      {contextMenu && (
        <div className="context-overlay" onClick={() => setContextMenu(null)} />
      )}
      {deleteWarning && (
        <div className="folder-delete-backdrop">
          <div className="folder-delete-dialog scale-in">
            <h3>Delete folder?</h3>
            <p>
              <strong>{deleteWarning.name}</strong> has {deleteWarning.noteCount} note{deleteWarning.noteCount === 1 ? '' : 's'}
              {deleteWarning.folderCount > 0 ? ` and ${deleteWarning.folderCount} subfolder${deleteWarning.folderCount === 1 ? '' : 's'}` : ''}.
              They will move to Recently Deleted and can be restored together.
            </p>
            <div className="folder-delete-actions">
              <button className="secondary" onClick={() => setDeleteWarning(null)}>Cancel</button>
              <button
                className="danger"
                onClick={async () => {
                  await deleteFolder(deleteWarning.id)
                  if (selectedFolderId === deleteWarning.id) handleSelectSection(null)
                  setDeleteWarning(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function findFolder(folders: FolderType[], id: string): FolderType | null {
  for (const f of folders) {
    if (f.id === id) return f
    if (f.children) {
      const found = findFolder(f.children, id)
      if (found) return found
    }
  }
  return null
}
