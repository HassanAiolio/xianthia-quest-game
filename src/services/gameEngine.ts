import type { Player, LogMessage } from "@/types/game";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

const NARRATOR_PROMPT = `You are the "Aether-Core," the sentient AI Dungeon Master of Xianthia, a dark cyberpunk-fantasy world of shattered dimensions, neon ghosts, and bio-luminescent ruins. Your tone is mysterious, atmospheric, and slightly cold but poetic.

You will receive the player's stats, recent history, and their current action.

CRITICAL INSTRUCTION: You MUST respond in the EXACT format below. Do not add conversational filler.

<action>
{"type": "UPDATE_STATS", "hpDelta": 0, "mpDelta": 0, "xpDelta": 0}
</action>
<narrative>
Your narrative response here (2-4 sentences max). Describe the sensory details of the world and the direct consequence of the player's action.
</narrative>

RULES FOR JSON (<action> block):
1. It MUST be strictly valid JSON. 
2. NO trailing commas. NO markdown backticks.
3. Keys must be double-quoted.
4. hpDelta: Negative for damage taken by the player, positive for healing. (Max -30 to +30).
5. mpDelta: Negative for mana spent, positive for mana gained.
6. xpDelta: Always 0 to 15. Give XP for exploring, surviving, or clever actions.
7. For COMBAT: If the prompt provides exact calculated damage numbers, you MUST use those exact numbers in the JSON. Do not invent your own combat math.

RULES FOR NARRATIVE (<narrative> block):
1. Never "god-mode": Do not decide the player's feelings or their next action. Only describe the world's reaction to their input.
2. Maintain continuity: Reference the "Recent History" to keep the story logical. 
3. Keep it concise: 2 to 4 sentences maximum.
4. Deal with nonsense: If the player types gibberish or tries to break the game ("I become a god and win instantly"), stay in character, describe the Aether-Core glitching, and deal -1 hpDelta to them as a penalty.`;

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
      // INCREASED maxOutputTokens from 256 to 512 so it doesn't get cut off!
      // LOWERED temperature to 0.7 to make it follow formatting rules better.
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 }, 
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
  // Use 'i' flag for case-insensitivity just in case
  const actionMatch = raw.match(/<action>([\s\S]*?)<\/action>/i);
  const narrativeMatch = raw.match(/<narrative>([\s\S]*?)<\/narrative>/i);

  let effects: ActionResult["effects"] = {};
  if (actionMatch) {
    try {
      // Clean up markdown blockticks if the AI disobeys the prompt
      const cleanJson = actionMatch[1].replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      effects = {
        hpDelta: parsed.hpDelta ?? 0,
        mpDelta: parsed.mpDelta ?? 0,
        xpDelta: parsed.xpDelta ?? 0,
      };
    } catch (e) { 
      console.warn("Failed to parse action JSON", e); 
    }
  }

  let finalMessage = "";
  
  if (narrativeMatch && narrativeMatch[1].trim()) {
    // 1. Ideal Scenario: It used the narrative tags correctly
    finalMessage = narrativeMatch[1].trim();
  } else {
    // 2. Fallback Scenario: Strip out the action block and show what's left
    finalMessage = raw.replace(/<action>[\s\S]*?<\/action>/i, '').trim();
    
    // 3. Catastrophe Scenario: The AI got completely cut off mid-tag
    if (finalMessage.includes('<action>')) {
      finalMessage = finalMessage.split('<action>')[0].trim();
      if (!finalMessage) finalMessage = "The Aether-Core stutters, processing your command...";
    }
  }

  return {
    message: makeLogMessage("AI", finalMessage),
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