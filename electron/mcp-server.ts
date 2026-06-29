import express, { type Express, type Request, type Response } from 'express'
import type { Server } from 'node:http'
import type { McpStatus } from '@shared/types'
import { captureGodotWindow } from './capture'
import { listDir, readFileText } from './files'
import { restartGodot, stopGodot } from './godot'
import { getConfig } from './store'
import { findVersionById } from './versions'
import { findProfile } from '../src/lib/profiles'

// Local MCP server (main process). Runs an Express app on port 3727 so an
// external Claude Code client can auto-discover and call DevPad's tools by
// pointing at http://localhost:3727/manifest. Everything is local; nothing is
// uploaded.

export const MCP_PORT = 3727

let server: Server | null = null
let app: Express | null = null
let enabled = false

export function getMcpStatus(): McpStatus {
  return { enabled, running: server !== null, port: MCP_PORT }
}

// MCP-compatible tool manifest. Each tool maps to one POST endpoint below.
function buildManifest() {
  return {
    schema_version: 'v1',
    name_for_model: 'devpad',
    name_for_human: 'Zirtola — The AI Video Game Editor',
    description_for_model:
      'Tools for inspecting and controlling a local Godot game project via the Zirtola AI game editor. Capture the game window, read project files, list directories, and restart/stop the running Godot process.',
    description_for_human: 'Control and inspect your local Godot project.',
    api: { type: 'mcp', url: `http://localhost:${MCP_PORT}` },
    tools: [
      {
        name: 'capture_game_window',
        description:
          'Capture a screenshot of the running Godot window (falls back to the primary screen). Returns a base64-encoded PNG.',
        method: 'POST',
        path: '/capture_game_window',
        input_schema: { type: 'object', properties: {}, required: [] },
        output_schema: {
          type: 'object',
          properties: { screenshot: { type: 'string', description: 'base64 PNG' } },
        },
      },
      {
        name: 'read_file',
        description: 'Read the UTF-8 contents of a file within the Godot project.',
        method: 'POST',
        path: '/read_file',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        output_schema: {
          type: 'object',
          properties: { contents: { type: 'string' } },
        },
      },
      {
        name: 'list_files',
        description: 'List files and folders within a directory of the Godot project.',
        method: 'POST',
        path: '/list_files',
        input_schema: {
          type: 'object',
          properties: { dir: { type: 'string' } },
          required: ['dir'],
        },
        output_schema: { type: 'object', properties: { tree: { type: 'object' } } },
      },
      {
        name: 'restart_godot',
        description: 'Kill and relaunch the Godot process.',
        method: 'POST',
        path: '/restart_godot',
        input_schema: { type: 'object', properties: {}, required: [] },
        output_schema: { type: 'object', properties: { status: { type: 'string' } } },
      },
      {
        name: 'stop_godot',
        description: 'Kill the running Godot process.',
        method: 'POST',
        path: '/stop_godot',
        input_schema: { type: 'object', properties: {}, required: [] },
        output_schema: { type: 'object', properties: { status: { type: 'string' } } },
      },
      {
        name: 'get_project_info',
        description: 'Return the active project directory, Godot version, and active profile.',
        method: 'POST',
        path: '/get_project_info',
        input_schema: { type: 'object', properties: {}, required: [] },
        output_schema: {
          type: 'object',
          properties: {
            projectDir: { type: 'string' },
            godotVersion: { type: 'string' },
            activeProfile: { type: 'string' },
          },
        },
      },
      {
        name: 'get_project_notes',
        description:
          "Return the developer's project notes (current state, goals, and future plans) that are shared as AI context. Read these first to understand the bigger picture of what the project is and where it's headed.",
        method: 'POST',
        path: '/get_project_notes',
        input_schema: {
          type: 'object',
          properties: {
            all: {
              type: 'boolean',
              description: 'Include notes not pinned for AI (default false).',
            },
          },
          required: [],
        },
        output_schema: {
          type: 'object',
          properties: {
            notes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  content: { type: 'string' },
                  pinnedToAi: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    ],
  }
}

// Confine file/dir access to within the configured project directory so the MCP
// server can't be used to read arbitrary files on disk.
function withinProject(target: string): boolean {
  const projectDir = getConfig().projectDir
  if (!projectDir) return false
  const path = require('node:path') as typeof import('node:path')
  const resolved = path.resolve(target)
  const root = path.resolve(projectDir)
  return resolved === root || resolved.startsWith(root + path.sep)
}

function buildApp(): Express {
  const a = express()
  a.use(express.json({ limit: '20mb' }))

  // Allow local cross-origin so a browser-based MCP client can reach it.
  a.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    next()
  })
  a.options('*', (_req, res) => res.sendStatus(204))

  a.get('/manifest', (_req: Request, res: Response) => {
    res.json(buildManifest())
  })

  a.post('/capture_game_window', async (_req: Request, res: Response) => {
    const result = await captureGodotWindow()
    if (!result.ok) return res.status(500).json({ error: result.error })
    res.json({ screenshot: result.screenshot, source: result.source })
  })

  a.post('/read_file', (req: Request, res: Response) => {
    const target = String(req.body?.path ?? '')
    if (!target) return res.status(400).json({ error: 'Missing "path".' })
    if (!withinProject(target)) {
      return res.status(403).json({ error: 'Path is outside the project directory.' })
    }
    const result = readFileText(target)
    if (!result.ok) return res.status(404).json({ error: result.error })
    res.json({ contents: result.contents })
  })

  a.post('/list_files', (req: Request, res: Response) => {
    const dir = String(req.body?.dir ?? getConfig().projectDir)
    if (!withinProject(dir)) {
      return res.status(403).json({ error: 'Directory is outside the project directory.' })
    }
    const tree = listDir(dir)
    if (!tree) return res.status(404).json({ error: 'Directory not found.' })
    res.json({ tree })
  })

  a.post('/restart_godot', (_req: Request, res: Response) => {
    try {
      restartGodot()
      res.json({ status: 'restarted' })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  a.post('/stop_godot', (_req: Request, res: Response) => {
    stopGodot()
    res.json({ status: 'stopped' })
  })

  a.post('/get_project_info', (_req: Request, res: Response) => {
    const cfg = getConfig()
    const version = findVersionById(cfg.activeVersionId)
    const profile = findProfile(cfg.profiles, cfg.activeProfileId)
    res.json({
      projectDir: cfg.projectDir,
      godotVersion: version?.label ?? cfg.activeVersionId,
      activeProfile: profile?.name ?? cfg.activeProfileId,
    })
  })

  a.post('/get_project_notes', (req: Request, res: Response) => {
    const includeAll = req.body?.all === true
    const notes = (getConfig().notes ?? [])
      .filter((n) => (includeAll ? true : n.pinnedToAi))
      .filter((n) => n.title.trim() || n.content.trim())
      .map((n) => ({
        id: n.id,
        title: n.title.trim() || 'Untitled note',
        content: n.content,
        pinnedToAi: n.pinnedToAi,
      }))
    res.json({ notes })
  })

  // Relay endpoint used by the in-app "MCP Mode" profile. DevPad itself does not
  // bundle an Anthropic key — in MCP Mode DevPad acts as the tool SERVER that an
  // external Claude Code client drives. So this returns a clear, actionable
  // message rather than fabricating a model response.
  a.post('/chat', (_req: Request, res: Response) => {
    res.json({
      text:
        'MCP Mode is active. In this mode Zirtola runs as a local tool server for an ' +
        'external Claude Code client. To chat with Claude through Zirtola, point Claude ' +
        `Code at the manifest:\n\n\`\`\`\nhttp://localhost:${MCP_PORT}/manifest\n\`\`\`\n\n` +
        'Then Claude can call Zirtola tools (capture the game window, read files, ' +
        'restart Godot, etc.). For direct in-app chat, switch to a non-MCP profile ' +
        '(Cheap / Balanced / Quality) in the toolbar.',
    })
  })

  return a
}

/** Start the server if not already running. */
export function startMcpServer(): Promise<McpStatus> {
  enabled = true
  return new Promise((resolve) => {
    if (server) return resolve(getMcpStatus())
    app = buildApp()
    server = app.listen(MCP_PORT, '127.0.0.1', () => {
      console.log(`[mcp] listening on http://localhost:${MCP_PORT}`)
      resolve(getMcpStatus())
    })
    server.on('error', (err) => {
      console.error('[mcp] server error', err)
      server = null
      resolve(getMcpStatus())
    })
  })
}

/** Stop the server if running. */
export function stopMcpServer(): Promise<McpStatus> {
  enabled = false
  return new Promise((resolve) => {
    if (!server) return resolve(getMcpStatus())
    server.close(() => {
      server = null
      app = null
      console.log('[mcp] stopped')
      resolve(getMcpStatus())
    })
  })
}

export async function setMcpEnabled(value: boolean): Promise<McpStatus> {
  return value ? startMcpServer() : stopMcpServer()
}
