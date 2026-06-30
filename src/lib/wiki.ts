// In-app Wiki content. Plain data so the Help modal can list, search, and render
// it with the shared Markdown component. Keep articles short and task-focused.

export interface WikiArticle {
  id: string
  title: string
  category: string
  /** Extra search terms not necessarily in the title. */
  keywords: string[]
  /** Markdown body. */
  body: string
}

export const WIKI_CATEGORIES = [
  'Getting Started',
  'Running & the Engine',
  'AI & Editing',
  'Assets & Notes',
  'Settings',
] as const

export const WIKI_ARTICLES: WikiArticle[] = [
  {
    id: 'what-is-zirtola',
    title: 'What is Zirtola?',
    category: 'Getting Started',
    keywords: ['overview', 'about', 'intro', 'godot', 'ai'],
    body: `Zirtola is **The AI Video Game Editor** — a local-first companion for building games in **Godot**. You describe what you want in plain English; Zirtola writes the code, edits scenes, generates art, runs the game, reads errors, and helps fix them.

It runs **next to** Godot (ideally on a second monitor). Godot opens in its own window; Zirtola is the AI panel beside it.

Everything stays on your machine — your project, settings, and API keys are local.`,
  },
  {
    id: 'first-run',
    title: 'First-time setup',
    category: 'Getting Started',
    keywords: ['wizard', 'onboarding', 'install', 'setup', 'start'],
    body: `On first launch a setup wizard walks you through:

1. **Welcome** — what Zirtola does.
2. **Project folder** — pick (or create) your Godot project.
3. **Set up Godot** — Zirtola detects an installed Godot, or **downloads it for you** automatically. You can also pick the executable manually.
4. **API keys** — add at least one (DeepSeek, Gemini, or OpenAI) to use the AI.
5. **Done** — you land in the main app.

You can replay the guided **product tour** anytime from **Help → Replay tour**.`,
  },
  {
    id: 'launcher',
    title: 'The launcher: new & recent projects',
    category: 'Getting Started',
    keywords: ['launcher', 'home', 'new project', 'open', 'recent'],
    body: `Click the **Zirtola** logo (top-left) to return to the launcher. From there you can:

- **Start New Project** — pick a folder; Zirtola scaffolds a Godot project if the folder is empty.
- **Open Project…** — browse to an existing Godot project.
- **Open Recent** — jump back into a project you used before.

The **Check for Updates** button is in the lower-left of the launcher.`,
  },
  {
    id: 'running',
    title: 'Running your game (Run / Stop / Restart)',
    category: 'Running & the Engine',
    keywords: ['run', 'play', 'stop', 'restart', 'hotkey', 'f5', 'f6', 'f7', 'launch'],
    body: `Use the toolbar buttons or global hotkeys (they work even when Zirtola isn’t focused):

- **Run** — launch the game — **F5**
- **Stop** — quit the running game — **F6**
- **Restart** — stop then relaunch — **F7**

The dot next to the buttons shows whether the game is Stopped, Starting, or Running. Configure the Godot executable and project in **Settings → Godot**.`,
  },
  {
    id: 'console',
    title: 'The Console: output & errors',
    category: 'Running & the Engine',
    keywords: ['console', 'errors', 'logs', 'output', 'problems', 'fix', 'debug'],
    body: `The bottom **Console** captures everything your game prints, with two tabs:

- **Output** — all logs.
- **Problems** — just warnings and errors.

Every error has a one-click **Fix** button that sends the error (and its \`res://file:line\`) to the AI and asks for a corrected solution.`,
  },
  {
    id: 'engine-bridge',
    title: 'The Engine tab & Godot bridge',
    category: 'Running & the Engine',
    keywords: ['engine', 'bridge', 'addon', 'scene tree', 'capture', 'plugin', 'reload'],
    body: `The **Engine** tab connects Zirtola to the running Godot editor via the **Zirtola Bridge** add-on.

1. Open the **Engine** tab → **Install Bridge addon**.
2. Open (or reload) your project in Godot — the add-on connects automatically.

Once connected you get the **live scene tree**, **Run / Stop / Reload**, and **Capture → chat** (sends the in-editor viewport to the AI). Connecting the bridge also lets the AI make **safe scene edits** through Godot.`,
  },
  {
    id: 'chat-plan-build',
    title: 'Chat: Plan vs Build mode',
    category: 'AI & Editing',
    keywords: ['chat', 'plan', 'build', 'mode', 'ask', 'prompt', 'ai'],
    body: `The chat has two modes (toggle at the top of the panel):

- **Plan** — the AI discusses and refines a plan but **never edits files**. Great for thinking through a feature. When you’re happy, click **Approve & Build**.
- **Build** — the AI can propose **file and scene edits** that you review and apply.

Tip: pin **Notes** for the AI so it always understands your project’s bigger picture.`,
  },
  {
    id: 'applying-edits',
    title: 'Applying AI edits (diffs)',
    category: 'AI & Editing',
    keywords: ['edit', 'diff', 'apply', 'reject', 'code', 'gdscript', 'write file'],
    body: `In **Build** mode the AI proposes changes as cards in the chat:

- **File edits** show a colour-coded **diff** against the current file (or “NEW FILE”). Click **Apply** to write it, or **Reject** to dismiss.
- **Scene edits** (when the Godot bridge is connected) list node operations and **Apply in editor** runs them *through Godot* so the scene file stays valid.

A **checkpoint** is taken automatically before anything is written, so every change is undoable.`,
  },
  {
    id: 'checkpoints',
    title: 'Checkpoints: undo anything',
    category: 'AI & Editing',
    keywords: ['checkpoint', 'undo', 'history', 'restore', 'git', 'revert', 'backup'],
    body: `Zirtola snapshots your project (via git, on a private ref that never touches your own branches) **before each AI edit**.

Open **Checkpoints** (↺ in the toolbar) to:

- see the list of snapshots,
- **Restore** any of them (the restore is itself checkpointed, so it’s undoable),
- or **Checkpoint now** to take a manual snapshot.

You can turn auto-checkpointing on/off in **Settings → Godot**.`,
  },
  {
    id: 'saving',
    title: 'Saving — do I need to?',
    category: 'AI & Editing',
    keywords: ['save', 'save as', 'autosave', 'persist', 'export', 'lose work'],
    body: `There’s no “Save” button because Zirtola never holds unsaved work:

- **AI edits** are written straight to disk when you click **Apply** (and checkpointed first).
- **Notes** autosave as you type.
- **Scenes** are saved by **Godot** itself — use **Ctrl+S** in Godot, or let scene edits apply through the bridge (which saves the scene).

So nothing is lost. The equivalents you might be looking for:

- **“Save a version”** → take a **Checkpoint** (↺) — restore to it anytime.
- **“Save As / duplicate the project”** → use the launcher’s **Start New Project** with a copy of your folder, or copy the folder in your file manager.`,
  },
  {
    id: 'asset-studio',
    title: 'Asset Studio: generate art',
    category: 'Assets & Notes',
    keywords: ['asset', 'art', 'sprite', 'tileset', 'background', 'icon', 'image', 'generate'],
    body: `Open **Asset Studio** (image icon in the toolbar) to create game art from a description.

1. Describe the asset (e.g. “a cute green slime enemy”).
2. Pick a **type** — Sprite, Tile/Texture, Background, Icon, or Concept. Sprites/icons/tiles get a transparent background.
3. **Generate**, preview, then **Save to Project** (lands in \`res://assets/generated/\` and imports automatically) or **Send to chat**.

Requires an **OpenAI API key**.`,
  },
  {
    id: 'notes',
    title: 'Notes & shared AI context',
    category: 'Assets & Notes',
    keywords: ['notes', 'ideas', 'todo', 'context', 'memory', 'plan', 'roadmap'],
    body: `The **Notes** tab (left sidebar) is a markdown notebook for ideas, todos, and plans — so they don’t get scattered.

Each note has an **AI** toggle. Notes you pin are **shared with the AI on every request**, so it stays aware of your project’s direction and goals. Notes autosave and are stored locally.`,
  },
  {
    id: 'files',
    title: 'The File browser',
    category: 'Assets & Notes',
    keywords: ['files', 'browser', 'tree', 'open', 'send to ai', 'project files'],
    body: `The **Files** tab shows your project tree. You can:

- **Single-click** a file to open it in your system’s default editor.
- **Right-click** for: Open, Copy Path, or **Send to AI** (drops the file’s contents into the chat).
- **Refresh** to rescan after external changes.`,
  },
  {
    id: 'profiles',
    title: 'Model profiles & routing',
    category: 'Settings',
    keywords: ['profile', 'model', 'deepseek', 'gemini', 'openai', 'claude', 'cost', 'quality', 'routing'],
    body: `A **profile** maps each task — chat, vision, vision→code, file analysis — to a specific model. Switch the active profile from the toolbar.

Built-in profiles:

- **Cheap** — fastest/cheapest (DeepSeek-heavy).
- **Balanced** — a mix.
- **Quality** — best results (Gemini/GPT).
- **MCP** — routes through Claude Code via the local MCP server.

Create your own in **Settings → AI / Models → Manage Profiles**; each task slot only offers models capable of that task.`,
  },
  {
    id: 'api-keys',
    title: 'API keys',
    category: 'Settings',
    keywords: ['api', 'key', 'settings', 'deepseek', 'gemini', 'openai', 'test connection'],
    body: `Add your keys in **Settings → AI / Models → API Keys**. Use **Test** to verify each one.

Keys are stored **locally and encrypted** — nothing is uploaded. You need at least one key to chat (the MCP profile needs none). Asset generation needs an **OpenAI** key.`,
  },
  {
    id: 'mcp',
    title: 'MCP server (Claude Code)',
    category: 'Settings',
    keywords: ['mcp', 'claude code', 'server', 'tools', 'integration', 'port', '3727'],
    body: `Zirtola can run a local **MCP server** so Claude Code (or any MCP client) can drive its tools — capture the game window, read files, list directories, restart Godot, and read your project notes.

Enable it in **Settings → MCP Server**, then copy the config snippet into Claude Code. The manifest lives at \`http://localhost:3727/manifest\`.`,
  },
  {
    id: 'updates',
    title: 'Updating Zirtola',
    category: 'Settings',
    keywords: ['update', 'check for updates', 'version', 'install', 'upgrade'],
    body: `Zirtola checks for updates on startup and you can check manually from the launcher (lower-left) or **Settings → App Updates**.

When a newer version is found it downloads automatically and prompts you to **Restart & Install**.`,
  },
]
