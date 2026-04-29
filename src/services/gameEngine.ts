import type { Player, LogMessage, Item, Location } from "@/types/game";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const NARRATOR_PROMPT = `You are the "Aether-Core," the sentient AI Dungeon Master of Xianthia, a dark cyberpunk-fantasy world. Your tone is mysterious, atmospheric, and slightly cold.

You will receive the player's stats, inventory, current location, recent history, and their current action.

You MUST respond with a valid JSON object matching this EXACT structure:
{
  "narrative": "Your narrative response here. Describe sensory details, combat outcomes, or items found.",
  "effects": {
    "hpDelta": 0, 
    "mpDelta": 0, 
    "xpDelta": 0  
  },
  "locationChange": {
    "name": "New Area Name",
    "description": "2-sentence atmospheric description of the new room.",
    "imageDescription": "1-sentence visual description for an AI image generator (e.g., 'A neon-lit server room with glowing cables')"
  },
  "inventoryChanges": {
    "add": [
      { "id": "unique-id", "name": "Item Name", "type": "consumable", "description": "What it does" }
    ],
    "remove": ["id-of-item-to-remove"]
  }
}

RULES:
1. locationChange: ONLY output this object if the player moves to a completely new area or room. Otherwise, output null.
2. inventoryChanges: ONLY output this if the player picks up, drops, or consumes an item. If no changes, output null.
3. Combat: You are the combat arbiter. If the player attacks or is attacked, calculate reasonable damage, update hpDelta, and narrate the blow. 
4. Leveling: If the player gains XP and their total goes over 100, narrate them feeling a surge of power.
5. hpDelta/mpDelta/xpDelta: Negative for loss, positive for gain.`;

// ── Helpers ──────────────────────────────────────────────────────────────────

let logCounter = 0;
export function makeLogMessage(sender: LogMessage["sender"], text: string): LogMessage {
  return { id: `log-${Date.now()}-${++logCounter}`, sender, text, timestamp: Date.now() };
}

type Intent = "combat" | "rest" | "scan" | "explore";

function detectIntent(input: string): Intent {
  const s = input.toLowerCase();
  if (s.match(/attack|strike|fight|hit|slash|shoot|stab|cast|blast/)) return "combat";
  if (s.match(/rest|meditate|sleep|recover|heal/)) return "rest";
  if (s.match(/scan|look|inspect|examine|search|observe/)) return "scan";
  return "explore";
}

async function callGroq(userMessage: string): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", 
      messages: [
        { role: "system", content: NARRATOR_PROMPT },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" } 
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

function parseAIResponse(raw: string): ActionResult {
  try {
    const parsed = JSON.parse(raw);
    return {
      message: makeLogMessage("AI", parsed.narrative || "The Aether-Core is silent."),
      effects: parsed.effects,
      locationChange: parsed.locationChange,
      inventoryChanges: parsed.inventoryChanges
    };
  } catch (e) {
    console.error("Failed to parse AI JSON:", e, raw);
    return {
      message: makeLogMessage("SYSTEM", "Aether-Core Error: Data stream corrupted."),
      effects: {}
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ActionResult {
  message: LogMessage;
  effects?: { hpDelta?: number; mpDelta?: number; xpDelta?: number; };
  locationChange?: Location | null;
  inventoryChanges?: { add?: Item[]; remove?: string[] } | null;
}

export async function generateNPCResponse(): Promise<LogMessage> {
  const raw = await callGroq("A mysterious NPC approaches the player. Generate a short cryptic greeting in character.");
  return parseAIResponse(raw).message;
}

export async function processAction(
  input: string,
  player: Player,
  gameLog: LogMessage[],
  inventory: Item[],       // <-- NEW PARAMETER
  currentLocation: Location // <-- NEW PARAMETER
): Promise<ActionResult> {
  
  const recentHistory = gameLog.slice(-5).map(log => `${log.sender}: ${log.text}`).join('\n');
  const inventoryList = inventory.map(i => `${i.name} (${i.description})`).join(', ') || "Empty";

  // Feed everything into the AI so it knows exactly what is happening
  const prompt = `CURRENT STATE:
Player: ${player.name} (Level ${player.level} ${player.class})
HP: ${player.hp}/${player.maxHp} | MP: ${player.mp}/${player.maxMp} | XP: ${player.xp}
Current Location: ${currentLocation.name} - ${currentLocation.description}
Inventory: ${inventoryList}

Recent History:
${recentHistory}

Player Action: ${input}

Calculate the outcome, narrate the result, and manage the game state via JSON.`;

  const raw = await callGroq(prompt);
  console.log("====== PURE AI RESPONSE ======");
  console.log(raw);
  console.log("==============================");

  return parseAIResponse(raw);
}