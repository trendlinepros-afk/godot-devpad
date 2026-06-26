# DevPad — Local Godot Game Dev Companion

DevPad is a **local-first** Electron + React + TypeScript desktop app that sits
next to the Godot editor (ideally on a second monitor) and gives you a one-click
launcher, an AI assistant that can see your game window, a project file browser,
model-routing profiles, and a local MCP server for Claude Code.

DevPad does **not** embed the Godot window — Godot launches as an external
process in its own window. Nothing is uploaded; all config, profiles and API
keys are stored locally (electron-store, encrypted at rest).

## Quick start

```bash
npm install
npm run dev      # launches Vite + Electron in development
npm run build    # typecheck + build renderer and main process
npm run dist     # package with electron-builder (Windows primary target)
```

On first launch a setup wizard walks you through choosing a project folder, the
Godot executable, and at least one API key.

## Features

| # | Feature | Where |
|---|---------|-------|
| 1 | Godot launcher (Run/Stop/Restart, F5/F6/F7 global hotkeys) | `electron/godot.ts`, `src/components/Toolbar.tsx` |
| 2 | AI chat panel (markdown, code highlighting, model badge, screenshot attach) | `src/components/ChatPanel.tsx` |
| 3 | Model registry + routing | `src/lib/models.ts`, `src/lib/router.ts`, `electron/ai/` |
| 4 | Model profiles (Cheap / Balanced / Quality / MCP + custom) | `src/lib/profiles.ts`, `src/components/ModelProfileEditor.tsx` |
| 5 | File browser (tree, icons, context menu, Send to AI) | `src/components/FileBrowser.tsx`, `electron/files.ts` |
| 6 | Screenshot capture (Godot window → fallback to screen) | `electron/capture.ts` |
| 7 | Local MCP server on port 3727 | `electron/mcp-server.ts` |
| 8 | Godot version manager (local + silent remote merge) | `godot-versions.json`, `electron/versions.ts` |
| 9 | Multi-monitor window positioning | `electron/main.ts` (`applyMonitorPosition`) |
| 10 | Notes hub (markdown, shared AI context) | `src/components/NotesList.tsx`, `src/components/NoteEditor.tsx`, `src/lib/notes.ts` |
| 11 | Project launcher (New / Open Recent) | `src/components/Launcher.tsx` |
| 12 | App self-update (GitHub Releases) | `electron/updater.ts`, `src/components/UpdateControls.tsx` |

## Launcher & self-update

On open, DevPad shows a **launcher**: **Start New Project** (pick a folder —
DevPad scaffolds a `project.godot` if the folder doesn't have one), **Open
Project…**, and an **Open Recent** list. Click the DevPad logo in the toolbar to
return to it.

The launcher's **lower-left** has a **Check for Updates** button (also in
Settings → App Updates). It uses `electron-updater` against the GitHub release
provider configured in `package.json` (`build.publish`): on a packaged build it
checks Releases, auto-downloads a newer installer, and prompts to restart &
install. In `npm run dev` it reports that updates need an installed build.
DevPad also does a silent update check on startup.

## Notes — shared AI context

DevPad has a built-in notes hub (left sidebar → **Notes** tab) so ideas, todos,
and plans live in one place instead of scattered across files. Notes are written
in markdown with a formatting toolbar and live preview.

Each note has an **AI** toggle. Notes that are pinned for AI are:

- **prepended as context to every AI request** (after the Godot version's system
  prompt) so all models understand the current state, goals, and future
  direction — see `notesContext()` in `electron/ai/router.ts`; and
- **exposed over the MCP server** via the `get_project_notes` tool, so an
  external Claude Code client can read the same bigger picture.

Notes are stored locally in electron-store and autosaved as you type.

## Architecture notes

- **All AI calls happen in the main process.** The renderer never touches a
  provider SDK or an API key. `src/lib/router.ts` is the single entry the Chat
  Panel imports; it forwards to the main process over the preload bridge, where
  `electron/ai/router.ts` performs the actual routing (screenshot → vision →
  vision_to_code; text → chat; MCP profiles → the local server) and
  `electron/ai/providers.ts` makes the network calls. This reconciles the spec's
  "panel calls router.ts only" with the "AI calls in the main process"
  constraint.
- **contextBridge only.** `nodeIntegration` is off and `contextIsolation` is on.
  Every renderer capability is funnelled through `window.devpad` (see
  `electron/preload.ts` and the `DevPadBridge` type in `src/shared/types.ts`).
- **The active Godot version's `aiSystemPrompt`** is always prepended as the
  system prompt to every AI request.
- **MCP Mode** turns DevPad into a local tool *server* that an external Claude
  Code client drives via `http://localhost:3727/manifest`. In-app chat with a
  non-MCP profile (Cheap/Balanced/Quality) uses the DeepSeek/Gemini/OpenAI
  providers directly.

## Provider model mapping

| Internal id | Provider | API model |
|-------------|----------|-----------|
| `deepseek-v3` | DeepSeek (OpenAI-compatible, `api.deepseek.com`) | `deepseek-chat` |
| `gemini-2.5-pro` / `gemini-2.5-flash` | Google Generative AI | same |
| `gpt-4o` / `gpt-4o-mini` | OpenAI | same |
| `mcp-claude` | local MCP server | — |
