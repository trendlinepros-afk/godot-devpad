// Steps for the interactive product tour. Each step points at an element marked
// with a matching data-tour="<target>" attribute. Steps with no target render a
// centered card (welcome / finish).

export interface TourStep {
  target?: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Zirtola 👋',
    body: "Here's a 60-second tour of how to build a game. You can replay this anytime from the Help menu.",
  },
  {
    target: 'run',
    title: 'Run your game',
    body: 'Launch your Godot game with Run (or press F5). Stop and Restart are right here too — they work even when Zirtola isn’t focused.',
    placement: 'bottom',
  },
  {
    target: 'left-tabs',
    title: 'Files · Notes · Engine',
    body: 'Browse your project Files, keep Notes (anything you pin is shared with the AI), and view the live Engine scene tree once the Godot bridge is connected.',
    placement: 'right',
  },
  {
    target: 'chat-mode',
    title: 'Plan vs Build',
    body: 'In Plan mode the AI helps you shape an idea without touching files. Switch to Build and it can actually write code and edit scenes — which you approve.',
    placement: 'bottom',
  },
  {
    target: 'composer',
    title: 'Just describe what you want',
    body: 'Type something like “add a double jump to the player.” The AI replies with file or scene changes shown as a diff — click Apply to write them (a checkpoint is saved first).',
    placement: 'top',
  },
  {
    target: 'profile',
    title: 'Pick your models',
    body: 'Profiles route each task to a model. Cheap is fastest/cheapest, Quality is best, MCP routes through Claude Code. Switch anytime.',
    placement: 'bottom',
  },
  {
    target: 'assets',
    title: 'Generate art',
    body: 'Asset Studio turns a description into sprites, tiles, backgrounds, or icons — saved straight into your project.',
    placement: 'bottom',
  },
  {
    target: 'checkpoints',
    title: 'Undo anything',
    body: 'Every AI edit is snapshotted automatically. Open Checkpoints to roll your project back to any point — experiment fearlessly.',
    placement: 'bottom',
  },
  {
    target: 'help',
    title: 'Help is always here',
    body: 'Replay this tour or open the searchable Wiki from the Help menu whenever you’re unsure how something works.',
    placement: 'bottom',
  },
  {
    title: "You're ready to build 🚀",
    body: 'Make sure you’ve added an API key in Settings, connect Godot, then ask the AI to build your first feature. Have fun!',
  },
]
