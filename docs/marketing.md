# Zirtola — The AI Video Game Editor

Marketing summary & messaging kit. Source of truth for the landing page.

---

## One-liner
**Zirtola is the AI copilot for making games in Godot — describe what you want, watch it build, see it run.**

## Elevator pitch (50 words)
Zirtola is a local-first desktop app that turns the Godot game engine into an AI-native studio. Describe a feature in plain English and Zirtola writes the scripts, edits the scenes, generates the art, runs the game, reads the errors, and fixes them — all on your machine, with every change reviewable and undoable.

## Positioning
The number-one "vibe coding" tool for video games. Cursor and Claude Code edit text; Zirtola understands the **engine** — your scene tree, your running game, your errors — and closes the loop from idea to playable.

## Who it's for
- **First-time / no-code creators** who want to make a game without learning an engine first.
- **Hobbyist & indie devs** who want to move at the speed of thought.
- **Experienced Godot devs** who want an AI that actually knows GDScript 4 and their project.

---

## The core loop (the hero story)
**Describe → Build → Run → See → Fix — automatically.**
1. Tell Zirtola what you want.
2. It proposes file and scene changes you review as clean diffs and apply with one click.
3. It runs your game in Godot.
4. It reads the game's output and errors.
5. One click turns any error into a fix.

Every step is local, reviewable, and undoable.

---

## Feature highlights (benefit-led)

### 🎮 Zero-to-game onboarding
Never used Godot? Never coded? Zirtola detects or **auto-downloads and connects the Godot engine for you** — no setup knowledge required. Start a new project or open a recent one from a friendly launcher.

### 💬 An AI that writes your game
Chat in plain English. Zirtola proposes **complete file edits as reviewable diffs** — Apply or Reject each one. It's an editor, not just a chatbot.

### 🧠 Engine-aware, not just text-aware
A first-party Godot add-on links Zirtola to the live editor: it sees your **scene tree**, can **run/stop/reload** the game, and captures the **in-editor viewport** — context a generic AI tool can't reach.

### 🌲 Safe scene editing
Zirtola changes your scenes **through Godot itself** (add nodes, set properties, attach scripts) so the engine validates every change — no corrupted scene files.

### 🛟 Fearless changes with checkpoints
Before any AI edit, Zirtola takes an automatic snapshot. Roll back to any checkpoint in one click. Experiment without fear.

### 🐛 Errors that fix themselves
Zirtola captures your game's output and errors into a built-in console. Every runtime error gets a one-click **"Fix"** that sends it to the AI for a corrected solution.

### 🎨 Asset Studio
Describe a sprite, tile, background, or icon and generate it — transparent backgrounds included — saved straight into your project, ready to use.

### 🗺️ Plan mode
Think before you build. Go back and forth with the AI to shape a plan, then hit **Approve & Build** to execute it.

### 📝 Notes that keep the AI on the same page
Capture ideas, todos, and your roadmap in a built-in notes hub. Pinned notes are shared with the AI on every request, so it always understands the bigger picture.

### 🎚️ Choose your models, control your cost
Route each task (chat, vision, code, file analysis) to the model you want — DeepSeek, Gemini, OpenAI, or Claude — with ready-made **Cheap / Balanced / Quality** profiles or your own.

### 🔌 Plugs into Claude Code
Zirtola runs a local MCP server, so Claude Code (or any MCP client) can drive your project's tools — capture the game, read files, restart Godot, read your notes.

### 🖥️ Built for a second screen
A companion panel designed to sit next to Godot on a second monitor, with global hotkeys (F5 run / F6 stop / F7 restart) that work even when Zirtola isn't focused.

---

## Why Zirtola is different
| | Generic AI code tools | **Zirtola** |
|---|---|---|
| Understands the game engine | ❌ | ✅ Live scene tree, run/reload, in-editor capture |
| Edits scenes safely | ❌ (text only) | ✅ Through Godot's own API |
| Closes the run → error → fix loop | ❌ | ✅ Built-in |
| Generates game art | ❌ | ✅ Asset Studio |
| Made for non-coders | ❌ | ✅ Auto-installs Godot, guided setup |
| Your data | Often cloud | ✅ 100% local |

---

## Trust & privacy
- **Local-first.** Config, notes, profiles, and API keys live on your machine. No cloud sync of your project.
- **Your keys, your models.** Bring your own API keys; keys are stored encrypted at rest.
- **Review everything.** AI changes are diffs you approve, with automatic checkpoints to undo.

## Platforms
Windows (primary), macOS supported. Auto-updates built in.

---

## Taglines (pick/test)
- *The AI Video Game Editor.*
- *Make games by describing them.*
- *From idea to playable — in one window.*
- *Your AI copilot for Godot.*
- *Vibe-code your video game.*

## Suggested page sections
1. Hero: tagline + one-liner + "Download for Windows" CTA + short loop demo (describe → diff → run).
2. The core loop (animated/gif).
3. Feature grid (the highlights above, 9–11 cards).
4. "Engine-aware" deep-dive (scene tree + in-editor capture screenshot).
5. Safety (checkpoints + diff review).
6. For beginners (auto-install Godot).
7. Comparison table.
8. Privacy/local-first.
9. FAQ + final download CTA.

## Starter FAQ
- **Do I need to know how to code?** No — Zirtola sets up Godot and writes the code for you; you review and approve.
- **Do I need Godot installed?** No — Zirtola can download and connect it automatically.
- **Is my project uploaded anywhere?** No. Everything runs locally; you bring your own AI keys.
- **Which AI models?** DeepSeek, Google Gemini, OpenAI, and Claude (via MCP) — your choice per task.
- **Which Godot version?** Built for Godot 4 (GDScript 2.0); version-aware prompting keeps suggestions current.

---

### Copywriter notes (keep claims honest)
- AI features require internet + your own provider API key(s); "local-first" refers to your project/config/data, not the model calls.
- Asset generation currently uses an OpenAI image model and produces images (sprite-sheet auto-slicing and SFX are roadmap).
- macOS auto-update needs code-signing for production; Windows works unsigned (SmartScreen prompt until signed).
- Product is in active development — calibrate "available now" language to your actual release state.
