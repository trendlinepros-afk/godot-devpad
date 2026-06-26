import { useCallback, useEffect, useState } from 'react'
import type { FileNode } from '@shared/types'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { chatBus } from '../state/chatBus'
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  RefreshIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from './Icons'

// Colour-coded glyphs for the Godot-relevant file types.
function fileGlyph(ext: string): { label: string; className: string } {
  switch (ext) {
    case 'gd':
      return { label: 'GD', className: 'text-emerald-400' }
    case 'tscn':
      return { label: 'SC', className: 'text-sky-400' }
    case 'tres':
    case 'res':
      return { label: 'RS', className: 'text-amber-400' }
    case 'godot':
      return { label: 'GP', className: 'text-accent-hover' }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'webp':
      return { label: 'IM', className: 'text-fuchsia-400' }
    default:
      return { label: '', className: 'text-slate-400' }
  }
}

interface ContextMenuState {
  x: number
  y: number
  node: FileNode
}

export function FileBrowser() {
  const { config } = useApp()
  const { toast } = useToast()
  const projectDir = config?.projectDir ?? ''

  const [root, setRoot] = useState<FileNode | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [childrenCache, setChildrenCache] = useState<Record<string, FileNode[]>>({})
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!projectDir) {
      setRoot(null)
      return
    }
    setLoading(true)
    const node = await window.devpad.files.list(projectDir)
    setRoot(node)
    setChildrenCache(node ? { [node.path]: node.children ?? [] } : {})
    setExpanded(node ? new Set([node.path]) : new Set())
    setLoading(false)
  }, [projectDir])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])

  const toggle = async (node: FileNode) => {
    const isOpen = expanded.has(node.path)
    const next = new Set(expanded)
    if (isOpen) {
      next.delete(node.path)
    } else {
      next.add(node.path)
      if (!childrenCache[node.path]) {
        const fetched = await window.devpad.files.list(node.path)
        setChildrenCache((c) => ({ ...c, [node.path]: fetched?.children ?? [] }))
      }
    }
    setExpanded(next)
  }

  const openFile = async (node: FileNode) => {
    if (node.isDir) {
      toggle(node)
      return
    }
    await window.devpad.files.openExternal(node.path)
  }

  const copyPath = async (node: FileNode) => {
    await navigator.clipboard.writeText(node.path)
    toast('Path copied to clipboard', 'success')
  }

  const sendToAI = async (node: FileNode) => {
    const result = await window.devpad.files.read(node.path)
    if (!result.ok) {
      toast(result.error ?? 'Could not read file', 'error')
      return
    }
    const ext = node.ext || 'text'
    chatBus.insert(
      `Here is \`${node.name}\`:\n\n\`\`\`${ext}\n${result.contents}\n\`\`\`\n\n`,
    )
    toast(`Sent ${node.name} to chat`, 'success')
  }

  return (
    <div className="flex h-full flex-col bg-panel-850">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-panel-600 px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Project Files
        </span>
        <button
          onClick={refresh}
          title="Refresh"
          className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-panel-600 hover:text-slate-200"
        >
          <RefreshIcon width={14} height={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1 text-sm">
        {!projectDir && (
          <p className="px-3 py-4 text-xs leading-relaxed text-slate-500">
            No project folder set. Open <span className="text-slate-300">Settings → Godot</span> to
            choose your Godot project.
          </p>
        )}
        {projectDir && !root && !loading && (
          <p className="px-3 py-4 text-xs text-slate-500">Project folder not found.</p>
        )}
        {root && (
          <Tree
            nodes={childrenCache[root.path] ?? []}
            depth={0}
            expanded={expanded}
            childrenCache={childrenCache}
            onToggle={toggle}
            onOpen={openFile}
            onContext={(e, node) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, node })
            }}
          />
        )}
      </div>

      {menu && (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-md border border-panel-600 bg-panel-800 py-1 text-sm shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label="Open"
            onClick={() => {
              openFile(menu.node)
              setMenu(null)
            }}
          />
          <MenuItem
            label="Copy Path"
            onClick={() => {
              copyPath(menu.node)
              setMenu(null)
            }}
          />
          {!menu.node.isDir && (
            <MenuItem
              label="Send to AI"
              onClick={() => {
                sendToAI(menu.node)
                setMenu(null)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-slate-300 hover:bg-panel-700"
    >
      {label}
    </button>
  )
}

interface TreeProps {
  nodes: FileNode[]
  depth: number
  expanded: Set<string>
  childrenCache: Record<string, FileNode[]>
  onToggle: (node: FileNode) => void
  onOpen: (node: FileNode) => void
  onContext: (e: React.MouseEvent, node: FileNode) => void
}

function Tree({ nodes, depth, expanded, childrenCache, onToggle, onOpen, onContext }: TreeProps) {
  return (
    <ul>
      {nodes.map((node) => {
        const isOpen = expanded.has(node.path)
        const glyph = fileGlyph(node.ext)
        return (
          <li key={node.path}>
            <div
              onClick={() => onOpen(node)}
              onContextMenu={(e) => onContext(e, node)}
              className="group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-panel-700"
              style={{ paddingLeft: depth * 12 + 6 }}
              title={node.path}
            >
              <span className="grid w-3.5 place-items-center text-slate-500">
                {node.isDir ? (
                  isOpen ? (
                    <ChevronDownIcon width={12} height={12} />
                  ) : (
                    <ChevronRightIcon width={12} height={12} />
                  )
                ) : null}
              </span>
              {node.isDir ? (
                isOpen ? (
                  <FolderOpenIcon width={15} height={15} className="text-accent-hover" />
                ) : (
                  <FolderIcon width={15} height={15} className="text-accent-hover" />
                )
              ) : glyph.label ? (
                <span
                  className={`grid h-[15px] w-[15px] place-items-center rounded-sm bg-panel-700 text-[8px] font-bold ${glyph.className}`}
                >
                  {glyph.label}
                </span>
              ) : (
                <FileIcon width={15} height={15} className="text-slate-400" />
              )}
              <span className="truncate text-slate-300 group-hover:text-slate-100">
                {node.name}
              </span>
            </div>
            {node.isDir && isOpen && (
              <Tree
                nodes={childrenCache[node.path] ?? []}
                depth={depth + 1}
                expanded={expanded}
                childrenCache={childrenCache}
                onToggle={onToggle}
                onOpen={onOpen}
                onContext={onContext}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
