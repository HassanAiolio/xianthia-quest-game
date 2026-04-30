import type { Player, LogMessage, Item, Location, Quest, Enemy, GameState } from "@/types/game";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const NARRATOR_PROMPT = `You are the "Aether-Core," the sentient AI Dungeon Master of Xianthia, a dark cyberpunk-fantasy world. Your tone is mysterious, atmospheric, and slightly cold.

You will receive the player's stats, inventory, current location, recent history, and their current action.

You MUST respond with a valid JSON object matching this EXACT structure:
{
  "narrative": "Your narrative response here. Describe sensory details, combat outcomes, or items found.",
  "triggerEncounter": false,
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
    "add": [ { "id": "unique-id", "name": "Item Name", "type": "consumable", "description": "What it does" } ],
    "remove": ["id-of-item-to-remove"]
  },
  "questChanges": {
    "add": [ { "id": "unique-quest-id", "title": "New Quest", "description": "What to do", "status": "active" } ],
    "update": [ { "id": "existing-quest-id", "status": "completed" } ]
  }
}

RULES:
1. locationChange: ONLY output this object if the player moves to a completely new area or room. Otherwise, output null.
2. inventoryChanges: ONLY output this if the player picks up, drops, or consumes an item. If no changes, output null.
3. Combat: You are the combat arbiter. If the player attacks or is attacked, calculate reasonable damage, update hpDelta, and narrate the blow. 
4. Leveling: If the player gains XP and their total goes over 100, narrate them feeling a surge of power.
5. hpDelta/mpDelta/xpDelta: Negative for loss, positive for gain. 
6. questChanges: ONLY output this if the player receives a new mission or completes a current objective.
7. Encounters: If the player does something dangerous, searches a hostile area, or actively tries to attack something, set "triggerEncounter" to true.`;

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

async function callGroq(userMessage: string, systemMessage: string = NARRATOR_PROMPT): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemMessage }, // <--- Now uses the parameter!
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" }
    }),
  });
  if (!response.ok) throw new Error(`Groq error: ${response.status}`);
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
      inventoryChanges: parsed.inventoryChanges,
      questChanges: parsed.questChanges
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
  questChanges?: { add?: Quest[]; update?: { id: string; status: "active" | "completed" }[] } | null;
  enemyChange?: Enemy | "clear" | null;
  stateChange?: GameState;
}

export async function generateNPCResponse(): Promise<LogMessage> {
  const raw = await callGroq("A mysterious NPC approaches the player. Generate a short cryptic greeting in character.");
  return parseAIResponse(raw).message;
}

// HELPER 1: Generates the enemy based on story context
async function generateEncounter(player: Player, location: Location, recentHistory: string): Promise<Enemy> {
  const systemPrompt = `You are an AI generating RPG enemy stats. Respond ONLY in valid JSON.`;
  const userPrompt = `The player (Level ${player.level}) triggered combat in ${location.name}. 
  Recent events: ${recentHistory}. 
  Generate a balanced enemy. 
  
  JSON EXACT FORMAT:
  {
    "id": "enemy-${Date.now()}",
    "name": "Neon-Blighted Synth",
    "hp": ${30 + (player.level * 10)},
    "maxHp": ${30 + (player.level * 10)},
    "minDamage": ${2 + player.level},
    "maxDamage": ${6 + player.level},
    "imageDescription": "A malfunctioning android leaking cyan fluid in a dark alley"
  }`;
  
  const raw = await callGroq(userPrompt, systemPrompt); // <--- Bypasses Narrator Prompt!
  return JSON.parse(raw) as Enemy;
}

// HELPER 2: D&D Style Math + Signature Abilities!
export function calculateCombatTurn(player: Player, enemy: Enemy, action: string) {
  const actionLower = action.toLowerCase();
  const isDefending = actionLower.match(/defend|block|dodge|hide|cover/);

  // Check if they typed their ability name
  const usesTemporal = player.class === "Chrono-Mage" && actionLower.includes("temporal cascade");
  const usesSpectral = player.class === "Neural-Stalker" && actionLower.includes("spectral hack");
  const usesVoidstrike = player.class === "Rift-Knight" && actionLower.includes("voidstrike");
  
  const isAbility = usesTemporal || usesSpectral || usesVoidstrike;
  const abilitySuccess = isAbility && player.mp >= 10;
  const abilityMpCost = abilitySuccess ? 10 : 0; // Costs 10 MP!

  // --- PLAYER'S TURN ---
  let playerHits = false;
  let playerDamage = 0;

  if (!isDefending) {
    if (abilitySuccess) {
      // Signature Abilities are guaranteed hits and deal big damage based on primary stat!
      playerHits = true;
      if (usesTemporal) playerDamage = Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + 2 + player.stats.int; // 2d6 + 2 + INT
      if (usesSpectral) playerDamage = Math.floor(Math.random() * 8) + 4 + player.stats.dex; // 1d8 + 4 + DEX
      if (usesVoidstrike) playerDamage = Math.floor(Math.random() * 12) + 2 + player.stats.str; // 1d12 + 2 + STR
    } else {
      // Regular Attack: 1d20 + highest stat to hit a base AC of 12
      const highestStat = Math.max(player.stats.str, player.stats.dex, player.stats.int);
      const playerHitRoll = Math.floor(Math.random() * 20) + 1;
      playerHits = (playerHitRoll + highestStat) >= 12;

      if (playerHits) {
        playerDamage = Math.floor(Math.random() * 6) + 1 + highestStat; // 1d6 + Stat
      }
    }
  }

  const newEnemyHp = Math.max(0, enemy.hp - playerDamage);
  const enemyDied = newEnemyHp === 0;

  // --- ENEMY'S TURN ---
  let enemyHits = false;
  let enemyDamage = 0;

  if (!enemyDied) {
    // Player AC = 10 + Dexterity (Defending grants +5 AC)
    const playerAC = 10 + player.stats.dex + (isDefending ? 5 : 0);
    const enemyHitRoll = Math.floor(Math.random() * 20) + 1;
    
    enemyHits = (enemyHitRoll + 4) >= playerAC;

    if (enemyHits) {
      enemyDamage = Math.floor(Math.random() * (enemy.maxDamage - enemy.minDamage + 1)) + enemy.minDamage;
    }
  }

  return { playerHits, playerDamage, enemyHits, enemyDamage, newEnemyHp, enemyDied, isDefending, abilitySuccess, abilityMpCost };
}

// HELPER 3: Tell the AI what happened
async function narrateCombatTurn(player: Player, enemy: Enemy, action: string, math: any): Promise<string> {
  const systemPrompt = `You are a dark cyberpunk AI DM. Respond ONLY in valid JSON.`;
  
  const userPrompt = `The player used the action: "${action}". 
  COMBAT RESULTS:
  - Player Turn: Defending? ${!!math.isDefending}. Used Signature Ability? ${!!math.abilitySuccess}. Did they hit? ${math.playerHits}. Damage: ${math.playerDamage}.
  - Enemy Turn: Did they hit the player? ${math.enemyHits}. Damage: ${math.enemyDamage}.
  - Is the enemy dead? ${math.enemyDied}.
  
  Write a 3-sentence visceral narrative. Describe misses if someone missed! If they used their signature ability, make it sound incredibly epic. 
  Do NOT invent new damage numbers. Respond ONLY in JSON format: { "narrative": "text here" }`;
  
  const raw = await callGroq(userPrompt, systemPrompt);
  return JSON.parse(raw).narrative;
}


export async function processAction(
  input: string,
  player: Player,
  gameLog: LogMessage[],
  inventory: Item[],
  currentLocation: Location,
  quests: Quest[],
  currentEnemy: Enemy | null, // <-- NEW PARAMETER
  gameState: GameState        // <-- NEW PARAMETER
): Promise<ActionResult> {
  const recentHistory = gameLog.slice(-5).map(log => `${log.sender}: ${log.text}`).join('\n');

  // === ROUTE A: WE ARE IN COMBAT ===
  if (gameState === "COMBAT" && currentEnemy) {
    // 1. Do the Math
    const math = calculateCombatTurn(player, currentEnemy, input); // <-- Pass input
    
    // 2. Get the AI to narrate it
    const narrative = await narrateCombatTurn(player, currentEnemy, input, math);
    
    return {
      message: makeLogMessage("AI", narrative),
      effects: { 
        hpDelta: -math.enemyDamage, 
        mpDelta: -math.abilityMpCost,
        xpDelta: math.enemyDied ? 25 : 0 // Give 25 XP for a kill!
      },
      enemyChange: math.enemyDied ? "clear" : { ...currentEnemy, hp: math.newEnemyHp },
      stateChange: math.enemyDied ? "PLAYING" : "COMBAT"
    };
  }

  // === ROUTE B: WE ARE EXPLORING ===
  const inventoryList = inventory.map(i => `${i.name}`).join(', ') || "Empty";
  const questList = quests.map(q => `[${q.status.toUpperCase()}] ${q.title}: ${q.description} (ID: ${q.id})`).join('\n') || "None";
  
  const prompt = `CURRENT STATE: Player: ${player.name} (Level ${player.level} ${player.class}) HP: ${player.hp}/${player.maxHp} | MP: ${player.mp}/${player.maxMp} | XP: ${player.xp}
  Current Location: ${currentLocation.name} - ${currentLocation.description}
  Inventory: ${inventoryList}
  Active Quests: ${questList}
  Recent History: ${recentHistory}
  Player Action: ${input}
  Calculate the outcome, narrate the result, and manage the game state via JSON.`;

  const raw = await callGroq(prompt);
  console.log("====== PURE AI RESPONSE ======");
  console.log(raw);
  console.log("==============================");
  
  const parsedAiResponse = parseAIResponse(raw);

  // We need to peek into the raw parsed JSON to see if triggerEncounter is true
  let rawJson;
  try {
    rawJson = JSON.parse(raw);
  } catch {
    rawJson = {};
  }

  let enemyChange: Enemy | "clear" | null = null;
  let stateChange: GameState | undefined = undefined;

  // If the AI decides an encounter happens!
  if (rawJson.triggerEncounter) {
    const newEnemy = await generateEncounter(player, currentLocation, recentHistory);
    enemyChange = newEnemy;
    stateChange = "COMBAT";
    // Inject a warning into the narrative log
    parsedAiResponse.message.text += `\n\n>> WARNING: ENCOUNTER DETECTED: ${newEnemy.name} <<`;
  }

  return {
    ...parsedAiResponse,
    enemyChange,
    stateChange
  };
}