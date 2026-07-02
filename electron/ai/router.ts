import type { AiRequest, AiResponse, ModelProfile } from '@shared/types'
import { getConfig } from '../store'
import { findVersionById } from '../versions'
import { findProfile, DEFAULT_PROFILE_ID } from '../../src/lib/profiles'
import { modelLabel } from '../../src/lib/models'
import {
  callProvider,
  callProviderAgentic,
  MissingKeyError,
  ProviderKeys,
  type ToolExecutor,
  type ProgressFn,
} from './providers'
import { getBridgeStatus } from '../bridge-server'
import { projectFileMap, resolveProjectPath, readFileText, listDir } from '../files'
import { getLogs } from '../godot'

export const MCP_PORT = 3727

// Main-process AI router. This is the canonical implementation of the routing
// rules described in src/lib/router.ts. It runs in the main process so it can
// read API keys from electron-store and reach the network/MCP server.

function activeProfile(): ModelProfile {
  const cfg = getConfig()
  return (
    findProfile(cfg.profiles, cfg.activeProfileId) ??
    findProfile(cfg.profiles, DEFAULT_PROFILE_ID) ??
    cfg.profiles[0]
  )
}

/**
 * Build the shared "project notes" context block from notes the developer has
 * pinned for AI. This gives every model the bigger picture — current state,
 * goals and future plans — on every request.
 */
function notesContext(): string {
  const notes = getConfig().notes ?? []
  const pinned = notes.filter(
    (n) => n.pinnedToAi && (n.title.trim() || n.content.trim()),
  )
  if (pinned.length === 0) return ''
  const blocks = pinned
    .map((n) => `### ${n.title.trim() || 'Untitled note'}\n${n.content.trim()}`)
    .join('\n\n')
  return [
    '',
    '--- PROJECT NOTES (developer-maintained context) ---',
    'The developer keeps these notes about the project — its current state, goals,',
    'and things planned for the future. Use them to understand the bigger picture',
    'and keep your answers consistent with this direction:',
    '',
    blocks,
    '--- END PROJECT NOTES ---',
  ].join('\n')
}

/**
 * The active Godot version's aiSystemPrompt is prepended to every request, with
 * the developer's pinned project notes appended as shared context.
 */
/** A compact listing of the project's files so the AI knows the layout. */
function projectContext(): string {
  const cfg = getConfig()
  if (!cfg.projectDir) return ''
  const files = projectFileMap(cfg.projectDir)
  if (files.length === 0) return ''
  return [
    '',
    '--- PROJECT FILES ---',
    `The project is at ${cfg.projectDir}. These are its files (res:// paths):`,
    '',
    files.join('\n'),
    '--- END PROJECT FILES ---',
  ].join('\n')
}

// Keeps the assistant from peppering the user with permission questions and
// from delegating work back to them.
const WORKFLOW_GUIDANCE = `

--- HOW TO WORK ---
You can READ the project yourself with tools — never ask the developer to paste
files or for permission to look at them:
- Use the read_file tool to open any file (paths are in PROJECT FILES above), and
  list_files to browse a directory. Read what you need, then answer.
- Use get_godot_errors to see the running game's current errors and warnings.
  After you make changes that the developer runs, check it to confirm your fix
  worked (or to find what still needs fixing) — don't edit blind.
- Don't ask permission before each step; briefly say what you're doing and do it.
- When changing a file, output the edit directly as a zirtola-edit block — the
  developer approves edits in the UI, so never ask "may I edit this?".
- DO IT YOURSELF: never ask the developer to perform manual steps in the Godot
  editor (adding nodes, editing scenes, changing settings) — you can make EVERY
  project change yourself by editing files (scenes are .tscn text files,
  project settings are project.godot). Many Zirtola users have never coded or
  used Godot before; instructions like "open the scene and add a node" are a
  product failure. The only thing you may ask the developer to do is press Run.`

function systemPrompt(): string {
  const cfg = getConfig()
  const versionPrompt = findVersionById(cfg.activeVersionId)?.aiSystemPrompt ?? ''
  return `${versionPrompt}${notesContext()}${projectContext()}${WORKFLOW_GUIDANCE}`
}

// Plan mode: collaborate on a plan, never touch files.
const PLAN_PROMPT = `

--- PLAN MODE ---
You are in PLAN MODE. Do NOT edit any files or scenes and do NOT output
zirtola-edit or zirtola-scene blocks. Instead, collaborate with the developer to
shape a clear plan:
- Ask brief clarifying questions when the request is ambiguous.
- Propose an approach and discuss trade-offs.
- Keep a running, numbered plan and refine it as the developer responds.
End your message with a concise "## Plan" section listing the concrete steps
(files to create/modify, nodes to add, assets needed). When the developer
approves, they will switch to Build mode to execute it.`

// Instructs the model how to propose direct file edits that Zirtola renders as
// reviewable diffs the developer can apply with one click. Appended to the
// system prompt for code-capable tasks (chat / file_analysis / vision_to_code).
const EDIT_PROTOCOL_PROMPT = `

--- EDITING THE PROJECT ---
You can directly edit the developer's Godot project. When you want to CREATE or MODIFY a file, output a fenced block in EXACTLY this format:

\`\`\`zirtola-edit path="res://relative/path/file.gd"
<the COMPLETE new contents of the file>
\`\`\`

Rules:
- This works for EVERY file type in the project: scripts (.gd), scenes (.tscn), resources (.tres), shaders (.gdshader), project.godot — they are all text files you can create and modify. There is no file you "can't edit".
- Put the ENTIRE file contents inside the block — never a partial snippet or a diff.
- Before MODIFYING an existing file, read_file it first and base your edit on its actual current contents.
- Use the res:// path relative to the project root (e.g. res://scripts/player.gd). Create new files the same way.
- You may include multiple edit blocks in one reply; add a short explanation before each.
- Only use a zirtola-edit block when you actually want to change a file on disk. For illustrative code the developer should NOT apply, use a normal \`\`\`gdscript block instead.
- The closing \`\`\` must be ALONE at the start of its own line. If the file's contents themselves contain \`\`\` lines (e.g. a markdown file), use a LONGER outer fence (\`\`\`\`zirtola-edit … closed by \`\`\`\`) so the block doesn't end early.
- The developer reviews a diff and approves each change before it is written, so prefer complete, working files.`

// Instructs the model how to propose scene changes that are applied THROUGH the
// Godot editor (safe) rather than by hand-editing .tscn. Only offered when the
// editor bridge is connected.
const SCENE_PROTOCOL_PROMPT = `

--- EDITING SCENES ---
The Godot editor is connected. For scene/node changes you MUST use this
zirtola-scene protocol (the editor validates and applies it safely) rather than
hand-editing .tscn text — editing .tscn directly while the editor is open can
corrupt the scene or be overwritten. Output a fenced block:

\`\`\`zirtola-scene
{ "scene": "res://levels/main.tscn", "ops": [
  { "op": "add_node", "type": "Sprite2D", "name": "Player", "parent": ".", "properties": { "position": { "__type": "Vector2", "values": [100, 50] } }, "script": "res://player.gd" },
  { "op": "set_property", "node": "Player", "property": "visible", "value": true },
  { "op": "attach_script", "node": "Player", "script": "res://player.gd" },
  { "op": "remove_node", "node": "OldEnemy" }
] }
\`\`\`

Rules:
- "scene" is optional; omit to edit the currently open scene.
- Node paths are relative to the scene root ("." is the root).
- Typed values use { "__type": "Vector2"|"Vector3"|"Color"|"NodePath", "values": [...] }.
- The developer reviews and applies; the editor validates and saves the scene.
- Use zirtola-edit (full file) for scripts and zirtola-scene for node structure.
- zirtola-scene works on the OPEN scene; for any other scene, edit its .tscn
  file directly with a zirtola-edit block (it's plain text). Never ask the
  developer to add nodes by hand.`

// When the editor bridge is NOT connected, scenes are edited as plain .tscn
// text via zirtola-edit — the model must never conclude "I can't edit scenes"
// and delegate node-adding to the user.
const SCENE_FALLBACK_PROMPT = `

--- EDITING SCENES (direct .tscn) ---
The Godot editor bridge is not connected, so edit scenes by writing the .tscn
file directly with a zirtola-edit block — .tscn is a plain text format and this
is fully supported. NEVER ask the developer to open the editor and add nodes by
hand.

How to do it safely:
1. ALWAYS read_file the existing .tscn first and preserve everything you don't
   mean to change — especially the uid="uid://…" in the header and existing
   ext_resource ids.
2. Godot 4 scene structure:
   [gd_scene load_steps=N format=3 uid="uid://…"]           ← header; load_steps = 1 + number of ext_resource + sub_resource entries
   [ext_resource type="Script" path="res://player.gd" id="1_abc"]
   [sub_resource type="BoxShape3D" id="BoxShape3D_1"]
   size = Vector3(2, 1, 2)
   [node name="Root" type="Node3D"]                          ← first node = scene root (no parent)
   [node name="Player" type="CharacterBody3D" parent="."]    ← parent="." means child of root
   script = ExtResource("1_abc")
   [node name="Mesh" type="MeshInstance3D" parent="Player"]  ← deeper paths use parent="Player/Mesh" style
   mesh = SubResource("BoxShape3D_1")
3. Adding a node = adding a [node …] section in tree order (parents before
   children). Attaching a script = ext_resource + script = ExtResource(id) on
   the node. Node properties go as key = value lines under the [node] header
   (Vector2(x, y), Vector3(x, y, z), Color(r, g, b, a), true/false, strings quoted).
4. Keep load_steps correct after adding/removing resources.
5. For a NEW scene file, the same format applies; pick any unused uid or omit
   the uid attribute entirely.
The developer reviews the diff like any other edit, and a checkpoint is saved
before it's applied — so make the change yourself rather than describing it.`

/** System prompt for code-capable tasks, varying by mode. */
function codeSystemPrompt(mode: 'plan' | 'build'): string {
  if (mode === 'plan') return `${systemPrompt()}${PLAN_PROMPT}`
  const sceneProtocol = getBridgeStatus().connected ? SCENE_PROTOCOL_PROMPT : SCENE_FALLBACK_PROMPT
  return `${systemPrompt()}${EDIT_PROTOCOL_PROMPT}${sceneProtocol}`
}

function keys(): ProviderKeys {
  return getConfig().apiKeys
}

// Read-only file tools the AI can call, confined to the project directory.
const execTool: ToolExecutor = async (name, args) => {
  if (name === 'read_file') {
    const abs = resolveProjectPath(String(args.path ?? ''))
    if (!abs) return 'Error: path is outside the project.'
    const r = readFileText(abs)
    return r.ok ? (r.contents ?? '') : `Error: ${r.error}`
  }
  if (name === 'list_files') {
    const dir = args.dir ? resolveProjectPath(String(args.dir)) : getConfig().projectDir
    if (!dir) return 'Error: invalid directory.'
    const node = listDir(dir)
    if (!node) return 'Error: directory not found.'
    return (node.children ?? [])
      .map((c) => (c.isDir ? `${c.name}/` : c.name))
      .join('\n')
  }
  if (name === 'get_godot_errors') {
    const problems = getLogs().filter((l) => l.level === 'error' || l.level === 'warn')
    if (problems.length === 0) return 'No errors or warnings in the current game console.'
    // Newest ~50 problems, with file:line when the parser captured it.
    return problems
      .slice(-50)
      .map((l) => {
        const loc = l.file ? ` [${l.file}${l.line ? `:${l.line}` : ''}]` : ''
        return `${l.level.toUpperCase()}${loc}: ${l.text}`
      })
      .join('\n')
  }
  return `Error: unknown tool "${name}".`
}

function missingKeyResponse(err: MissingKeyError): AiResponse {
  const names: Record<string, string> = {
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    openai: 'OpenAI',
  }
  const name = names[err.provider] ?? err.provider
  return {
    ok: false,
    text: '',
    error: `No ${name} API key configured. Add it in **Settings → API Keys** to use this model.`,
    needsSettings: true,
  }
}

/**
 * Route a chat request according to the active profile:
 *   • screenshot   → vision model describes it, then vision_to_code answers
 *   • file analysis→ file_analysis model
 *   • text only    → chat model
 *   • mcp profile  → every slot already resolves to mcp-claude, so all of the
 *                    above naturally flow through the MCP server.
 */
export async function route(req: AiRequest, onProgress?: ProgressFn): Promise<AiResponse> {
  const profile = activeProfile()
  const sys = systemPrompt()
  const codeSys = codeSystemPrompt(req.mode ?? 'build')
  const k = keys()

  try {
    // ── Screenshot: two-step vision → vision_to_code pipeline ───────────────
    if (req.screenshot) {
      const visionModel = profile.tasks.vision
      const v2cModel = profile.tasks.vision_to_code

      onProgress?.('status', 'Looking at your screenshot…')
      // Step 1 — describe the screenshot.
      const description = await callProvider(
        {
          modelId: visionModel,
          systemPrompt: sys,
          text:
            req.text?.trim()
              ? `Describe this Godot editor/game screenshot in detail, focusing on anything relevant to: "${req.text}". Note any visible errors, UI state, node layout, or rendering issues.`
              : 'Describe this Godot editor/game screenshot in detail. Note any visible errors, UI state, node layout, or rendering issues.',
          imageBase64: req.screenshot,
          history: req.history,
        },
        k,
        MCP_PORT,
      )

      // Step 2 — answer using the description + the original message.
      const answer = await callProviderAgentic(
        {
          modelId: v2cModel,
          systemPrompt: codeSys,
          text: [
            'A screenshot of the Godot project was analysed. Here is the description:',
            '',
            description,
            '',
            req.text?.trim()
              ? `The developer asks: ${req.text}`
              : 'Based on this, identify any problems and suggest concrete fixes (with GDScript where relevant).',
          ].join('\n'),
          history: req.history,
        },
        k,
        MCP_PORT,
        execTool,
        onProgress,
      )

      return {
        ok: true,
        text: answer,
        modelId: v2cModel,
        modelLabel: modelLabel(v2cModel),
      }
    }

    // ── File analysis ────────────────────────────────────────────────────────
    if (req.fileAnalysis) {
      const model = profile.tasks.file_analysis
      const text = await callProviderAgentic(
        { modelId: model, systemPrompt: codeSys, text: req.text, history: req.history },
        k,
        MCP_PORT,
        execTool,
        onProgress,
      )
      return { ok: true, text, modelId: model, modelLabel: modelLabel(model) }
    }

    // ── Text-only chat (AI can read project files via tools) ────────────────────
    const model = profile.tasks.chat
    const text = await callProviderAgentic(
      { modelId: model, systemPrompt: codeSys, text: req.text, history: req.history },
      k,
      MCP_PORT,
      execTool,
      onProgress,
    )
    return { ok: true, text, modelId: model, modelLabel: modelLabel(model) }
  } catch (err) {
    if (err instanceof MissingKeyError) return missingKeyResponse(err)
    return {
      ok: false,
      text: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
