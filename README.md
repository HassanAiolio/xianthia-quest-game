# Xianthia Quest

An ethereal cyberpunk RPG frontend built with **Vite + React 18 + TypeScript**, styled with **Tailwind CSS v4**, animated with **Framer Motion**, using **shadcn/ui**-style components and **Lucide** icons.

State is managed with React Context + `useReducer` and persisted to `localStorage`. The game logic lives behind a pluggable service layer (`src/services/gameEngine.ts`) — swap the mock with a real AI/Supabase backend without touching the UI.

## Requirements

- Node.js 18.18+ (20+ recommended)
- npm, pnpm, or bun

## Install & run

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Build

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  App.tsx                    # Root view-switcher
  main.tsx                   # ReactDOM bootstrap
  index.css                  # Tailwind v4 + design tokens
  types/game.ts              # All TypeScript interfaces
  hooks/useGameStore.ts      # GameProvider + useGameStore (Context + reducer + localStorage)
  services/gameEngine.ts     # Mock AI processing (pluggable)
  lib/utils.ts               # cn() helper
  components/
    ui/                      # shadcn primitives (button, input, label, tabs, scroll-area)
    game/
      LandingView.tsx
      CharacterCreationView.tsx
      GameView.tsx           # HUD + game log + inventory + quests
      VitalBar.tsx
      ParticleField.tsx
```

## Try it

- Type `attack` → simulates an HP drop
- Type `scan` / `look` → environmental readout
- Type `rest` / `meditate` → restores HP/MP
- Anything else → flavor narration

Your character & save state persist in `localStorage` under `xianthia-quest:v1`.
