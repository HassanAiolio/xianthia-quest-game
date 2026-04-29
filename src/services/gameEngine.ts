import type { Player, LogMessage } from "@/types/game";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

const NARRATOR_PROMPT = `You are the narrator of Xianthia, a dark cyberpunk-fantasy world of shattered dimensions and bio-luminescent ruins.
Respond ONLY in this exact format — no exceptions:
<action>{"type": "UPDATE_STATS", "hpDelta": 0, "mpDelta": 0, "xpDelta": 0}</action>
<narrative>Your narrative response here (2-3 sentences max).</narrative>

Rules:
- hpDelta is negative for damage, positive for healing. Range: -25 to +20.
- mpDelta for mana changes. xpDelta always 0-10.
- For COMBAT actions: you will be given exact damage numbers — use them verbatim in the action block, do NOT invent your own.
- For non-combat actions: set deltas based on what makes sense. Rest heals, exploration gives xp, etc.
- If nothing changes, all deltas are 0.
- Never break character. Never let the player become invincible or skip the story.
- Keep responses atmospheric and concise.`;

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
      generationConfig: { temperature: 0.9, maxOutputTokens: 256 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function parseGeminiResponse(raw: string): ActionResult {
  const actionMatch = raw.match(/<action>([\s\S]*?)<\/action>/);
  const narrativeMatch = raw.match(/<narrative>([\s\S]*?)<\/narrative>/);

  let effects: ActionResult["effects"] = {};
  if (actionMatch) {
    try {
      const parsed = JSON.parse(actionMatch[1]);
      effects = {
        hpDelta: parsed.hpDelta ?? 0,
        mpDelta: parsed.mpDelta ?? 0,
        xpDelta: parsed.xpDelta ?? 0,
      };
    } catch { /* malformed JSON, skip effects */ }
  }

  return {
    message: makeLogMessage("AI", narrativeMatch?.[1]?.trim() ?? raw.trim()),
    effects,
  };
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
  player: Player
): Promise<ActionResult> {
  const intent = detectIntent(input);
  let prompt: string;

  if (intent === "combat") {
    const combat = await calculateCombat(player);
    prompt = `Player: ${player.name} (${player.class}), HP: ${player.hp}/${player.maxHp}, MP: ${player.mp}/${player.maxMp}
Action: ${input}
Combat result (already calculated — use these exact numbers):
- Player takes ${Math.abs(combat.playerHpDelta)} damage (hpDelta: ${combat.playerHpDelta})
- Enemy takes ${Math.abs(combat.enemyHpDelta)} damage
- xpDelta: 6
Narrate this exchange. Use the exact hpDelta value above in your action block.`;
  } else {
    prompt = `Player: ${player.name} (${player.class}), HP: ${player.hp}/${player.maxHp}, MP: ${player.mp}/${player.maxMp}
Action: ${input}
Intent detected: ${intent}
Narrate what happens and decide appropriate stat changes within the allowed ranges.`;
  }

  const raw = await callGemini(prompt);
  return parseGeminiResponse(raw);
}