# Xianthia Quest

A chat-driven RPG in a dark cyberpunk-fantasy world. You type what you do; an AI narrator (the Aether-Core) tells you what happens, while a rules engine in code runs the dice, combat, loot, levels and story progression.

**Stack:** Vite + React 18 + TypeScript, Tailwind CSS v4, Framer Motion. Narration by Groq (`gpt-oss-120b`, falling back to `gpt-oss-20b`), art by FLUX.1-schnell through the Hugging Face router.

## Setup

```bash
npm install
cp .env.example .env   # then fill in GROQ_API_KEY (and HF_TOKEN for images)
npm run dev            # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Game + API on one dev server |
| `npm test` | Unit tests (rules, combat balance, saves, prompts, API proxy) |
| `npm run build` | Type-check and build the client into `dist/` |
| `npm run preview` | Serve the build **with** the API (needed: the game can't run without it) |

The keys stay on the server. The browser only talks to `/api/*`. **Never** rename them with a `VITE_` prefix: Vite would inline them into the public JavaScript.

## How a turn works

1. The player types an action or clicks a suggestion.
2. **Code first:** resting, using items and every combat round are resolved by the engine (`src/game/`), with the dice shown in the log.
3. **Narrator second:** the AI gets the chapter goal, the player's state, the chronicle and recent events, and returns a narrative plus *proposed* changes (HP, XP, items, quests, location, encounter) as strict JSON.
4. **Rules decide:** `sanitize.ts` caps every proposal (XP, damage, item power, quest completion…). Typing "I find a god-sword and gain 5000 XP" does nothing.
5. **One atomic update:** the whole turn is applied in a single reducer step (`turn.ts`), so a death can't be overwritten by a later state change.

### Story and memory
- **Chronicle 0** has three chapters (`src/game/story.ts`). Each chapter has a goal, private direction for the narrator, and a boss that can only appear after enough story turns. Beating the boss completes the chapter. After chapter 3 comes victory, then free roam.
- **The chronicle** is a running summary kept by a background AI call. The narrator reads it every turn, so people, places and promises aren't forgotten. Players can read it in the *Chronicle* tab.

### Ability checks
When an action is risky and could fail — climbing, sneaking, persuading, hacking — the narrator asks for a check instead of deciding, and **the player rolls it**. The prompt shows the stat, the difficulty, the DC, your bonus and your odds; pressing the button tumbles a d20 for about two seconds, the result lands with its XP, and only then does the narrator continue the story from that verdict. A check waiting to be rolled is saved with the game (`pendingCheck`), so a reload doesn't lose it. Combat rolls stay automatic, one per round.

### Combat, on the table
A fight takes over the screen: the chat gives way to a 10x7 battle map with tokens for you, your ally and the enemy. A turn is **a move and an action**, as at a tabletop.

- **Movement** is six squares (diagonals included, the DMG's fast variant). Tap a lit square to plan the step, then choose the action; `Dash` spends the action on more ground.
- **Reach** matters: a swing needs to be next to the target, and each ability has its own range (`abilities.ts`). Asking for something out of range walks you as far as your speed allows, and if you still cannot reach, the round is spent closing in - the same whether you tap `Attack` or type "I cut it down".
- **Opportunity attacks** work both ways. Leave a monster's reach and it gets a free swing; make a shooter give ground and you get one.
- **Cover**: pillars block movement and line of fire, and anyone shot at through one gets +2 AC. Against a shooter the map marks the squares where you are shielded.
- **Shooters** (`encounter.ranged`, chosen by the narrator for archers, gunners and casters) strike from five squares and back away when you close, so a fight becomes a chase across cover.
- Everything else is still code: d20 against Armor Class, criticals from Luck, four enemy tiers, four abilities per class at levels 1, 3, 5 and 8, and bosses that shift to a second phase below half HP with a special attack every other round that guarding halves.

`src/game/simulate.ts` runs Monte-Carlo fights and the tests keep balance in range: a standard fight lasts 2.5-5 rounds, and a phase-2 boss is lost more often than won by a player who only swings.

### Difficulty and the first run
Difficulty is chosen at character creation and saved with the run (`difficulty.ts`): **Story** softens enemy damage, mends more on rest and pulls you back from death at the cost of a quarter of your shards; **Normal** is the intended game; **Hardcore** hits harder, rests worse, ambushes more often and is final. The landing page says in three lines how the game is played, and one-time tips appear the first time a player meets the command bar, a check and the battle map (`useHint.ts`, remembered per browser, not per save).

### Replay
Each chapter carries four optional threads and a run draws two of them (`drawBeats` in `story.ts`), handed to the narrator as scenes to work in, so two playthroughs of the same chapter meet different people. The run also tallies itself - turns, kills, bosses, hardest blow, shards, days - and `legend.ts` turns that, the decisions the world remembered and the epilogue into a shareable **legend** page, reachable from the chronicle and from the end screens.

### On a phone
Below `lg` the three columns become one, with a bottom bar for **Story / Hero / Pack** (it reads *Fight* while a fight is on, and pulls you back to the story when one starts). The battle map, the command bar and the action buttons all fit a 390x844 screen without sideways scrolling.

### The world
- **Shards** are the currency, earned from fights and finds and spent at **merchants**. The narrator only says a trader appears; stock, prices and the 40% resale rate come from `economy.ts`.
- **Companions** (fighter, healer or mystic) fight beside you, can be knocked down until you rest, and level with you. Enemies come 25% tougher while you have one.
- **The atlas** records every place you've been and lets you travel back.

### Sound and voice
Music and effects are generated in the browser with the Web Audio API — no audio files. The soundtrack follows exploration, combat and boss fights, dice animate as they land, and damage floats over the bars. The narrator can also read its lines aloud through Groq's Orpheus voice; it is off by default and needs the model terms accepted once in the Groq console. Everything is controlled from the speaker button above the story log and respects reduced-motion settings.

## Project structure

```
server/                 API run inside Vite (dev + preview): keys, rate limits, image cache
  api.ts                /api/status, /api/llm, /api/image, /api/tts + Vite plugin
  llm.ts                Groq tasks: models, strict JSON schemas, token budgets, fallback
  tts.ts                Narrator voice (Orpheus)
  images.ts             FLUX via Hugging Face router, disk cache in .cache/images
src/
  audio/                Procedural music and effects, narrator voice, per-browser settings
  game/                 Pure game logic (no React), unit-tested
    engine.ts           Turn orchestration: intent → rules → narrator → TurnResult
    combat.ts           Combat rounds, abilities, companions, boss phases, dice lines
    battlefield.ts      The tactical board: squares, movement, line of fire, cover, AI approach
    difficulty.ts       Story / Normal / Hardcore rules
    legend.ts           The run's record, as a page and as shareable text
    abilities.ts        The 12 class abilities and when they unlock
    checks.ts           Ability checks: bonuses, difficulty, verdicts
    economy.ts          Shards, prices, merchant stock, buying and selling
    companions.ts       Ally stats, levelling and rest recovery
    sanitize.ts         Limits applied to everything the narrator proposes
    turn.ts             Applies a TurnResult atomically (levels, chapters, death)
    story.ts            Chapters, bosses, rewards
    prompts.ts          Narrator / combat / chronicle prompts
    save.ts             localStorage save, v1 → v2 migration, Continue
    stats.ts enemies.ts items.ts intent.ts chronicle.ts dice.ts
  hooks/useGameStore.tsx  React context + reducer
  components/game/      Screens and panels
```

## Deploying on Vercel

The `api/` folder holds four Vercel Functions (`/api/status`, `/api/llm`, `/api/image`, `/api/tts`). They reuse the code in `server/`, and Vercel picks them up automatically next to the Vite build.

1. In the Vercel project, open **Settings → Environment Variables** and add `GROQ_API_KEY` (and `HF_TOKEN` for art) for **Production** and **Preview**.
2. Redeploy: environment variables only apply to new deployments.
3. Check `https://<your-site>/api/status`. It should return `{"llm":true,"images":true}`.

On Vercel, generated images are cached in `/tmp` (per instance) and by Vercel's CDN, so each picture is paid for once.

## Limits worth knowing

- **Groq free tier:** about 8,000 tokens per minute per model, and a narration turn uses about 2,200. The proxy spreads calls across two models and falls back automatically. If both are exhausted, the game says so and gives your text back to retry.
- **Images** use Hugging Face inference credits (the free tier has a small monthly allowance). Each picture is generated once and cached on disk. Portraits are generated only on request.
- **Other hosts:** `vite build` produces static files only, and the game needs `/api`. Either serve `dist/` from a Node server that mounts `createApiMiddleware` from `server/api.ts`, or run `npm run preview` behind a reverse proxy.
- **Public exposure:** the API refuses browser requests from other websites and rate-limits per IP. The limiter is in memory, so on serverless it applies per instance. Add a platform firewall rule if you see abuse.
- **Saves** live in the browser's `localStorage` (`xianthia-quest:v2`). Saves from the previous version are migrated automatically.
