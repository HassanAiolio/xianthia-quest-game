import type { Player, LogMessage } from "@/types/game";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

const NARRATOR_PROMPT = `You are the "Aether-Core," the sentient AI Dungeon Master of Xianthia, a dark cyberpunk-fantasy world. Your tone is mysterious, atmospheric, and slightly cold but poetic.

You will receive the player's stats, recent history, and their current action.

You MUST respond with a valid JSON object matching this exact structure:
{
  "narrative": "Your narrative response here (2-4 sentences max). Describe sensory details and the consequence.",
  "effects": {
    "hpDelta": 0, 
    "mpDelta": 0, 
    "xpDelta": 0  
  }
}

RULES:
1. hpDelta: Negative for damage taken, positive for healing (Max -30 to +30).
2. mpDelta: Negative for mana spent, positive for mana gained.
3. xpDelta: 0 to 15 for exploring, surviving, or clever actions.
4. For COMBAT: If exact calculated damage numbers are provided, you MUST use them in effects.hpDelta.
5. Never god-mode: Do not decide the player's feelings or next action.
6. Maintain continuity: Reference the Recent History.
7. Deal with nonsense: If the player types gibberish or tries to break the game, glitch and penalize them 1 HP.`;
// ── Helpers ──────────────────────────────────────────────────────────────────

let logCounter = 0;
export function makeLogMessage(
  sender: LogMessage["sender"],
  text: string
): LogMessage {
  return {
    id: `log-${Date.now()}-${++logCounter}`,
    sender,
    text,
    timestamp: Date.now(),
  };
}

type Intent = "combat" | "rest" | "scan" | "explore";

function detectIntent(input: string): Intent {
  const s = input.toLowerCase();
  if (s.match(/attack|strike|fight|hit|slash|shoot|stab|cast|blast/)) return "combat";
  if (s.match(/rest|meditate|sleep|recover|heal/)) return "rest";
  if (s.match(/scan|look|inspect|examine|search|observe/)) return "scan";
  return "explore";
}

async function callGemini(userMessage: string): Promise<string> {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: NARRATOR_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: { 
        temperature: 0.7, 
        maxOutputTokens: 800,
        // THIS IS THE MAGIC BULLET: It forces Gemini to output pure JSON
        responseMimeType: "application/json" 
      }, 
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

function parseGeminiResponse(raw: string): ActionResult {
  try {
    // Because we forced responseMimeType, we can just parse it directly!
    const parsed = JSON.parse(raw);
    
    return {
      message: makeLogMessage("AI", parsed.narrative || "The Aether-Core processes your command in silence."),
      effects: {
        hpDelta: parsed.effects?.hpDelta ?? 0,
        mpDelta: parsed.effects?.mpDelta ?? 0,
        xpDelta: parsed.effects?.xpDelta ?? 0,
      }
    };
  } catch (e) {
    console.error("Failed to parse Gemini JSON:", e, raw);
    return {
      message: makeLogMessage("SYSTEM", "Aether-Core Error: Data stream corrupted."),
      effects: {}
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ActionResult {
  message: LogMessage;
  effects?: {
    hpDelta?: number;
    mpDelta?: number;
    xpDelta?: number;
  };
}

export interface CombatOutcome {
  playerHpDelta: number;
  enemyHpDelta: number;
  log: string;
}

export async function calculateCombat(player: Player): Promise<CombatOutcome> {
  const dmgDealt = 8 + Math.floor(player.stats.str * 1.5 + Math.random() * 6);
  const dmgTaken = 6 + Math.floor(Math.random() * 8);
  return {
    playerHpDelta: -dmgTaken,
    enemyHpDelta: -dmgDealt,
    log: `You deal ${dmgDealt} damage. The enemy answers with ${dmgTaken}.`,
  };
}

export async function generateNPCResponse(): Promise<LogMessage> {
  const raw = await callGemini(
    "A mysterious NPC approaches the player. Generate a short cryptic greeting in character."
  );
  const result = parseGeminiResponse(raw);
  return result.message;
}

export async function processAction(
  input: string,
  player: Player,
  gameLog: LogMessage[] // <-- ADD THIS
): Promise<ActionResult> {
  const intent = detectIntent(input);
  
  // 2. Format the last 5 messages for context
  const recentHistory = gameLog
    .slice(-5)
    .map(log => `${log.sender}: ${log.text}`)
    .join('\n');

  let prompt: string;

  if (intent === "combat") {
    const combat = await calculateCombat(player);
    prompt = `Player: ${player.name} (${player.class}), HP: ${player.hp}/${player.maxHp}, MP: ${player.mp}/${player.maxMp}
Recent History:
${recentHistory}

Action: ${input}
Combat result (already calculated — use these exact numbers):
- Player takes ${Math.abs(combat.playerHpDelta)} damage (hpDelta: ${combat.playerHpDelta})
- Enemy takes ${Math.abs(combat.enemyHpDelta)} damage
- xpDelta: 6
Narrate this exchange. Use the exact hpDelta value above in your action block.`;
  } else {
    prompt = `Player: ${player.name} (${player.class}), HP: ${player.hp}/${player.maxHp}, MP: ${player.mp}/${player.maxMp}
Recent History:
${recentHistory}

Action: ${input}
Intent detected: ${intent}
Narrate what happens and decide appropriate stat changes within the allowed ranges.`;
  }

  const raw = await callGemini(prompt);
  return parseGeminiResponse(raw);
}