# Zirtola — Local Godot Game Dev Companion

Zirtola is a **local-first** Electron + React + TypeScript desktop app that sits
next to the Godot editor (ideally on a second monitor) and gives you a one-click
launcher, an AI assistant that can see your game window, a project file browser,
model-routing profiles, and a local MCP server for Claude Code.

Zirtola does **not** embed the Godot window — Godot launches as an external
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
| 13 | Godot output + Problems console (one-click "Fix") | `electron/godot.ts`, `src/components/GodotConsole.tsx` |
| 14 | Guided Godot install & connect (detect / auto-download) | `electron/godot-install.ts`, `src/components/GodotSetup.tsx` |

## Beginner onboarding — get Godot running with zero setup knowledge

Zirtola is the only thing a newcomer downloads. If they've never used Godot (or
never coded), the launcher shows a **"Set up Godot"** assistant that:

1. **Detects** any Godot already on the machine (PATH, Steam, common folders).
2. **Auto-downloads** the latest official Godot for their OS and extracts it.
3. **Connects** it automatically (and auto-detects the version).

It's also available anytime from **Settings → Godot**, with a manual file picker
and an "open the download page" fallback.

## Agentic edits + checkpoints

Zirtola can write your game, not just talk about it. For code tasks the AI is told
it can propose file changes as fenced `zirtola-edit path="res://…"` blocks
(`EDIT_PROTOCOL_PROMPT` in `electron/ai/router.ts`). The chat renders each block
as an **EditCard**: a colour-coded diff against the current file (or "NEW FILE"),
with **Apply** / **Reject**. Apply writes the file (confined to the project
folder via `resolveProjectPath`).

Before any write, Zirtola takes a **git checkpoint** (`electron/git.ts`). These
are stored on a dedicated ref (`refs/zirtola/checkpoints`) using a temporary
index, so the user's own branch, HEAD and staging area are never touched. The
toolbar's **↺ history** button lists checkpoints and restores any of them (the
restore itself checkpoints first, so it's undoable). Toggle the safety net in
**Settings → Godot → Checkpoint before AI edits**.

## Asset Studio — generate game art

The toolbar's image button opens **Asset Studio**: describe a sprite, tile,
background, icon, or concept and generate it (OpenAI image model,
`generateImage` in `electron/ai/providers.ts`). Sprites/icons/tiles use a
transparent background. **Save to Project** writes the PNG to
`res://assets/generated/` (`electron/assets.ts`) where Godot auto-imports it as a
texture; **Send to chat** attaches it for the vision model to riff on. Needs an
OpenAI API key.

## Live Godot editor bridge (addon)

The **Engine** tab connects Zirtola to the running Godot editor via a first-party
addon, so it's engine-aware instead of guessing from OS screenshots.

- Zirtola hosts a WebSocket server on `127.0.0.1:3728` (`electron/bridge-server.ts`).
- The **Zirtola Bridge** EditorPlugin (`resources/godot-addon/zirtola_bridge/`)
  is installed into the project's `addons/` and enabled in `project.godot` by
  `electron/godot-addon.ts` (one click: Engine tab → *Install Bridge addon*).
- The addon connects back and speaks a tiny JSON-RPC dialect: `get_scene_tree`,
  `get_project_info`, `run`, `stop`, `reload`, `capture_viewport`.
- The Engine panel shows the **live scene tree**, a connection indicator, and
  Run / Stop / Reload / **Capture → chat** (attaches the editor viewport image
  to the chat composer for the vision model).

## The error → fix loop

Zirtola captures Godot's stdout/stderr (it no longer discards it) into a bottom
**Console** with **Output** and **Problems** tabs. Every runtime error gets a
one-click **Fix** button that sends the error (and its `res://file:line`) to the
AI and asks for the corrected code — closing the run → see → fix loop.

## Launcher & self-update

On open, Zirtola shows a **launcher**: **Start New Project** (pick a folder —
Zirtola scaffolds a `project.godot` if the folder doesn't have one), **Open
Project…**, and an **Open Recent** list. Click the Zirtola logo in the toolbar to
return to it.

The launcher's **lower-left** has a **Check for Updates** button (also in
Settings → App Updates). It uses `electron-updater` against the GitHub release
provider configured in `package.json` (`build.publish`): on a packaged build it
checks Releases, auto-downloads a newer installer, and prompts to restart &
install. In `npm run dev` it reports that updates need an installed build.
Zirtola also does a silent update check on startup.

### Cutting a release

The updater pulls from GitHub Releases, which are produced by
`.github/workflows/release.yml`. To publish a new version:

1. Bump `"version"` in `package.json`.
2. Commit, then push a matching tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

The workflow builds the Windows (NSIS) and macOS (dmg) installers on their
native runners and publishes them — plus the `latest.yml` / `latest-mac.yml`
metadata that electron-updater reads — to a GitHub Release. It authenticates
with the automatic `GITHUB_TOKEN`, so no extra secrets are required for an
unsigned build. (You can also trigger it manually from the Actions tab.)

> For production macOS auto-updates you'll need Apple code-signing +
> notarization; the CI currently builds macOS unsigned
> (`CSC_IDENTITY_AUTO_DISCOVERY=false`). Windows auto-update works unsigned, but
> users will see a SmartScreen prompt until the installer is code-signed.

## Notes — shared AI context

Zirtola has a built-in notes hub (left sidebar → **Notes** tab) so ideas, todos,
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
  (The runtime bridge name `window.devpad` is kept internally; the product is
  branded Zirtola.)
- **The active Godot version's `aiSystemPrompt`** is always prepended as the
  system prompt to every AI request.
- **MCP Mode** turns Zirtola into a local tool *server* that an external Claude
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
