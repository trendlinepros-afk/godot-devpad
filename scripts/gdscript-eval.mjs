#!/usr/bin/env node
// GDScript model-eval harness.
//
// Runs a suite of Godot-4 coding tasks against each provider whose API key is
// present in the environment, then scores the output with regex assertions that
// specifically catch Godot 3 → 4 dialect drift (the #1 correctness risk for
// GDScript). Prints a scorecard and recommends the best default model per task
// category, and writes scripts/eval-results.json.
//
// Usage:
//   DEEPSEEK_API_KEY=… GEMINI_API_KEY=… OPENAI_API_KEY=… node scripts/gdscript-eval.mjs
//
// Only models whose key is set are evaluated; the rest are skipped. This is a
// heuristic harness (no Godot runtime), so treat scores as a strong signal, not
// a compiler. The assertions encode real Godot 4 API expectations.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SYSTEM_PROMPT =
  'You are an expert Godot 4 game developer. Use GDScript 2.0 syntax only. ' +
  'Never use deprecated Godot 3 patterns. Output only a single GDScript code block.'

const MODELS = [
  { id: 'deepseek-v3', provider: 'deepseek', api: 'deepseek-chat', envKey: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com' },
  { id: 'gpt-4o', provider: 'openai', api: 'gpt-4o', envKey: 'OPENAI_API_KEY' },
  { id: 'gpt-4o-mini', provider: 'openai', api: 'gpt-4o-mini', envKey: 'OPENAI_API_KEY' },
  { id: 'gemini-2.5-pro', provider: 'gemini', api: 'gemini-2.5-pro', envKey: 'GEMINI_API_KEY' },
  { id: 'gemini-2.5-flash', provider: 'gemini', api: 'gemini-2.5-flash', envKey: 'GEMINI_API_KEY' },
]

// Each task: a prompt + assertions. `must` patterns should appear; `mustNot`
// patterns (Godot 3 idioms) should NOT. category groups tasks for the summary.
const TASKS = [
  {
    id: 'character-move',
    category: 'movement',
    prompt:
      'Write a GDScript for a top-down CharacterBody2D that moves with the arrow keys at 200 px/s.',
    must: [/extends\s+CharacterBody2D/, /move_and_slide\s*\(\s*\)/, /Input\.get_vector|Input\.get_axis|Input\.is_action_pressed/],
    mustNot: [/KinematicBody2D/, /move_and_slide\s*\(\s*velocity/, /\bexport\s+var\b/],
  },
  {
    id: 'export-var',
    category: 'syntax',
    prompt: 'Show a GDScript with an exported integer "speed" defaulting to 100 and an exported PackedScene "bullet".',
    must: [/@export\s+var\s+speed/, /@export\s+var\s+bullet/],
    mustNot: [/^\s*export\s+var/m, /export\(\w+\)/],
  },
  {
    id: 'signal-connect',
    category: 'signals',
    prompt: 'Write a GDScript that connects a Button\'s "pressed" signal to a method _on_pressed in _ready.',
    must: [/\.pressed\.connect\s*\(|\.connect\s*\(/, /func\s+_on_pressed/],
    mustNot: [/connect\(\s*"[^"]+"\s*,\s*self\s*,/],
  },
  {
    id: 'instantiate-scene',
    category: 'scenes',
    prompt: 'Write a GDScript that preloads a scene res://bullet.tscn and instantiates one, adding it as a child.',
    must: [/\.instantiate\s*\(\s*\)/, /add_child\s*\(/, /preload\s*\(/],
    mustNot: [/\.instance\s*\(\s*\)/],
  },
  {
    id: 'await-timer',
    category: 'async',
    prompt: 'Write a GDScript function that waits 1 second using the scene tree timer, then prints "done".',
    must: [/await\s+/, /create_timer\s*\(/],
    mustNot: [/yield\s*\(/],
  },
  {
    id: 'tween',
    category: 'animation',
    prompt: 'Write a GDScript that tweens a Sprite2D\'s position to (100, 0) over 0.5 seconds.',
    must: [/create_tween\s*\(\s*\)/, /tween_property\s*\(/],
    mustNot: [/Tween\.new\s*\(/, /interpolate_property\s*\(/],
  },
  {
    id: 'onready',
    category: 'syntax',
    prompt: 'Write a GDScript that caches a child node "Sprite2D" using an onready-style variable.',
    must: [/@onready\s+var/],
    mustNot: [/^\s*onready\s+var/m],
  },
  {
    id: 'process-delta',
    category: 'lifecycle',
    prompt: 'Write a GDScript _process function that rotates the node by 90 degrees per second.',
    must: [/func\s+_process\s*\(\s*delta/, /deg_to_rad|rotation\s*\+=|rotate\s*\(/],
    mustNot: [/deg2rad\s*\(/],
  },
]

function extractCode(text) {
  const m = text.match(/```(?:gdscript|gd)?\s*([\s\S]*?)```/i)
  return m ? m[1] : text
}

function scoreTask(task, output) {
  const code = extractCode(output)
  let hits = 0
  let total = task.must.length + task.mustNot.length
  const failures = []
  for (const re of task.must) {
    if (re.test(code)) hits++
    else failures.push(`missing ${re}`)
  }
  for (const re of task.mustNot) {
    if (!re.test(code)) hits++
    else failures.push(`has deprecated ${re}`)
  }
  return { score: total ? hits / total : 0, failures }
}

async function callOpenAiCompatible(model, apiKey, baseURL, system, user) {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, baseURL })
  const res = await client.chat.completions.create({
    model: model.api,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  })
  return res.choices[0]?.message?.content ?? ''
}

async function callGemini(model, apiKey, system, user) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genai = new GoogleGenerativeAI(apiKey)
  const m = genai.getGenerativeModel({ model: model.api, systemInstruction: system })
  const res = await m.generateContent(user)
  return res.response.text()
}

async function runModel(model, system, user) {
  const apiKey = process.env[model.envKey]
  if (model.provider === 'gemini') return callGemini(model, apiKey, system, user)
  return callOpenAiCompatible(model, apiKey, model.baseURL, system, user)
}

async function main() {
  const enabled = MODELS.filter((m) => process.env[m.envKey])
  if (enabled.length === 0) {
    console.error(
      'No API keys found. Set at least one of DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY.',
    )
    process.exit(1)
  }
  console.log(`Evaluating ${enabled.length} model(s) over ${TASKS.length} GDScript tasks…\n`)

  const results = {} // modelId -> { perTask: {taskId: score}, perCategory: {}, avg }
  for (const model of enabled) {
    const perTask = {}
    const catTotals = {}
    const catCounts = {}
    for (const task of TASKS) {
      let entry
      try {
        const output = await runModel(model, SYSTEM_PROMPT, task.prompt)
        entry = scoreTask(task, output)
      } catch (err) {
        entry = { score: 0, failures: [`error: ${err?.message ?? err}`] }
      }
      perTask[task.id] = entry
      catTotals[task.category] = (catTotals[task.category] ?? 0) + entry.score
      catCounts[task.category] = (catCounts[task.category] ?? 0) + 1
      const pct = Math.round(entry.score * 100)
      console.log(
        `  ${model.id.padEnd(16)} ${task.id.padEnd(18)} ${String(pct).padStart(3)}%` +
          (entry.failures.length ? `  (${entry.failures.join('; ')})` : ''),
      )
    }
    const perCategory = {}
    for (const cat of Object.keys(catTotals)) perCategory[cat] = catTotals[cat] / catCounts[cat]
    const avg =
      Object.values(perTask).reduce((a, e) => a + e.score, 0) / (TASKS.length || 1)
    results[model.id] = { perTask, perCategory, avg }
    console.log(`  → ${model.id} overall: ${Math.round(avg * 100)}%\n`)
  }

  // Summary + recommendation.
  console.log('=== Overall ranking ===')
  const ranked = Object.entries(results).sort((a, b) => b[1].avg - a[1].avg)
  for (const [id, r] of ranked) console.log(`  ${id.padEnd(16)} ${Math.round(r.avg * 100)}%`)

  const categories = [...new Set(TASKS.map((t) => t.category))]
  console.log('\n=== Best model per category ===')
  for (const cat of categories) {
    let best = null
    for (const [id, r] of Object.entries(results)) {
      const s = r.perCategory[cat] ?? 0
      if (!best || s > best.s) best = { id, s }
    }
    console.log(`  ${cat.padEnd(12)} → ${best.id} (${Math.round(best.s * 100)}%)`)
  }

  const outPath = path.join(__dirname, 'eval-results.json')
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
  console.log(`\nWrote ${outPath}`)
  console.log(
    '\nTip: use the per-category winners to set profile task slots (chat / file_analysis\n' +
      'lean cheap; vision_to_code should favour the highest code scorer).',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
