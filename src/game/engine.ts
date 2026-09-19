import type { GameSnapshot, Item, LogMessage, LogSender, LogTone, Player } from "@/types/game";
import type { AiRunner } from "@/services/ai";
import { describeRound, fallbackCombatNarrative, resolveCombatRound, type CombatAction } from "./combat";
import { clamp, makeId, type Rng } from "./dice";
import { TIERS, createEnemy, type EnemySpec } from "./enemies";
import { parseCombatInput, parseExploreInput } from "./intent";
import { rollLoot } from "./items";
import { buildCombatMessages, buildNarrateMessages } from "./prompts";
import { sanitizeNarration } from "./sanitize";
import { effectiveStats, scaleReward } from "./stats";
import { bossId, climaxReady, getChapter } from "./story";
import type { TurnResult } from "./turn";

export type TurnInput =
  | { kind: "text"; text: string }
  | { kind: "combat"; action: CombatAction; text?: string }
  | { kind: "rest" }
  | { kind: "use-item"; itemId: string };

export interface EngineDeps {
  ai: AiRunner;
  rng?: Rng;
}

const SIDE_QUEST_XP = 40;
const AFTER_VICTORY = ["Search the remains", "Catch your breath", "Press onward"];
const AFTER_ESCAPE = ["Find somewhere to hide", "Tend to your wounds", "Double back carefully"];
const FALLBACK_AMBUSHER: EnemySpec = {
  name: "Rift Scavenger",
  imageDescription: "hunched scavenger in patched neon armor wielding a jagged sparking blade",
  tier: "standard",
};

class Turn {
  readonly id = makeId("turn");
  readonly timestamp = Date.now();
  readonly logs: LogMessage[] = [];

  log(sender: LogSender, text: string, tone?: LogTone) {
    this.logs.push({ id: makeId("log"), sender, text, tone, timestamp: this.timestamp });
  }

  result(extra: Omit<TurnResult, "id" | "timestamp" | "logs"> = {}): TurnResult {
    return { id: this.id, timestamp: this.timestamp, logs: this.logs, ...extra };
  }
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Resolves one player turn. Rules run in code; the AI only narrates and proposes. */
export async function playTurn(state: GameSnapshot, input: TurnInput, deps: EngineDeps): Promise<TurnResult> {
  const player = state.player;
  if (!player) throw new Error("playTurn called without a player");
  const rng = deps.rng ?? Math.random;

  if (state.gameState === "COMBAT" && state.currentEnemy) return combatTurn(state, player, input, deps, rng);

  switch (input.kind) {
    case "use-item":
      return useItemTurn(state, player, input.itemId);
    case "rest":
      return restTurn(state, player, deps, rng);
    case "combat":
      return narrateTurn(state, player, input.text || "Look around warily.", deps);
    case "text": {
      const intent = parseExploreInput(input.text, state.inventory);
      if (intent.kind === "rest") return restTurn(state, player, deps, rng);
      if (intent.kind === "use-item") return useItemTurn(state, player, intent.itemId);
      return narrateTurn(state, player, input.text, deps);
    }
  }
}

function useItemTurn(state: GameSnapshot, player: Player, itemId: string): TurnResult {
  const turn = new Turn();
  const item = state.inventory.find((i) => i.id === itemId && i.type === "consumable");
  if (!item) {
    turn.log("SYSTEM", "You search your pack but find nothing like that to use.", "info");
    return turn.result();
  }
  const hp = Math.min(item.effect?.hp ?? 0, player.maxHp - player.hp);
  const mp = Math.min(item.effect?.mp ?? 0, player.maxMp - player.mp);
  if (hp <= 0 && mp <= 0) {
    turn.log("SYSTEM", `You are already at full strength; you keep the ${item.name} for later.`, "info");
    return turn.result();
  }
  const gains = [hp > 0 && `+${hp} HP`, mp > 0 && `+${mp} MP`].filter(Boolean).join(", ");
  turn.log("SYSTEM", `You use ${item.name}: ${gains}.`, "reward");
  return turn.result({ hpDelta: hp, mpDelta: mp, removeItemIds: [item.id] });
}

async function restTurn(state: GameSnapshot, player: Player, deps: EngineDeps, rng: Rng): Promise<TurnResult> {
  const lck = effectiveStats(player, state.inventory).lck;
  const ambushed = rng() < clamp(0.25 - 0.01 * lck, 0.05, 0.25);
  const hp = Math.min(Math.ceil(player.maxHp * (ambushed ? 0.2 : 0.4)), player.maxHp - player.hp);
  const mp = Math.min(Math.ceil(player.maxMp * (ambushed ? 0.25 : 0.5)), player.maxMp - player.mp);
  const note = ambushed
    ? "The player tries to rest but is ambushed partway through. You MUST set an encounter (tier minion or standard) and describe only the moment the ambush begins."
    : "The player rests safely and recovers. Nothing attacks: encounter must be null. Describe the rest and one small detail that moves the story forward.";

  const result = await narrateTurn(state, player, "Rest and recover my strength.", deps, {
    note,
    forceEncounter: ambushed,
    forbidEncounter: !ambushed,
    fallbackNarrative: ambushed
      ? "Your eyes have barely closed when something shifts in the dark."
      : "You find a quiet corner and let the hum of the glass lull you. For a while, nothing hunts you.",
  });
  // Rest recovery is decided here, not by the narrator.
  result.hpDelta = hp;
  result.mpDelta = mp;
  const recovered = `+${hp} HP, +${mp} MP`;
  result.logs.splice(1, 0, {
    id: makeId("log"),
    sender: "SYSTEM",
    text: ambushed ? `Rest interrupted (${recovered}).` : `You rest: ${recovered}.`,
    tone: ambushed ? "danger" : "reward",
    timestamp: result.timestamp,
  });
  return result;
}

interface NarrateOptions {
  note?: string;
  forceEncounter?: boolean;
  forbidEncounter?: boolean;
  /** When set, a narrator failure falls back to this text instead of failing the turn. */
  fallbackNarrative?: string;
}

async function narrateTurn(
  state: GameSnapshot,
  player: Player,
  action: string,
  deps: EngineDeps,
  opts: NarrateOptions = {}
): Promise<TurnResult> {
  const turn = new Turn();
  const ready = climaxReady(state.chapter, state.turnsInChapter);

  let raw: unknown;
  try {
    raw = await deps.ai("narrate", buildNarrateMessages(state, action, opts.note));
  } catch (err) {
    if (opts.fallbackNarrative === undefined) throw err;
    raw = { narrative: opts.fallbackNarrative };
  }
  const n = sanitizeNarration(raw, { player, inventory: state.inventory, quests: state.quests, climaxReady: ready });

  turn.log("AI", n.narrative || opts.fallbackNarrative || "The glyphs pulse, patient. Nothing answers — yet.");
  const extra: Omit<TurnResult, "id" | "timestamp" | "logs"> = { storyTurn: true };
  let xp = n.xpAward;

  if (n.location) extra.location = n.location;
  if (n.hpDelta) {
    extra.hpDelta = n.hpDelta;
    turn.log("SYSTEM", `${signed(n.hpDelta)} HP`, n.hpDelta < 0 ? "danger" : "reward");
  }
  if (n.mpDelta) {
    extra.mpDelta = n.mpDelta;
    turn.log("SYSTEM", `${signed(n.mpDelta)} MP`, n.mpDelta < 0 ? "danger" : "reward");
  }
  if (xp) turn.log("SYSTEM", `+${xp} XP`, "reward");

  if (n.itemsFound.length) {
    extra.addItems = n.itemsFound.map((i): Item => ({ id: makeId("item"), ...i }));
    for (const i of extra.addItems) turn.log("SYSTEM", `Found: ${i.name}`, "reward");
  }
  if (n.itemsConsumed.length) {
    extra.removeItemIds = n.itemsConsumed;
    for (const id of n.itemsConsumed) {
      const name = state.inventory.find((i) => i.id === id)?.name;
      if (name) turn.log("SYSTEM", `${name} is gone.`, "info");
    }
  }
  if (n.newQuest) {
    extra.addQuests = [{ id: makeId("quest"), ...n.newQuest, status: "active" }];
    turn.log("SYSTEM", `New quest: ${n.newQuest.title}`, "info");
  }
  if (n.completedQuestIds.length) {
    extra.completeQuestIds = n.completedQuestIds;
    const reward = scaleReward(SIDE_QUEST_XP, player.level);
    xp += reward;
    for (const id of n.completedQuestIds) {
      turn.log("SYSTEM", `Quest complete: ${state.quests.find((q) => q.id === id)?.title} (+${reward} XP)`, "reward");
    }
  }
  if (xp) extra.xpGain = xp;

  let encounter = opts.forbidEncounter ? null : n.encounter;
  if (opts.forceEncounter && !encounter) encounter = FALLBACK_AMBUSHER;
  if (encounter) {
    const ch = getChapter(state.chapter);
    const enemy =
      encounter.tier === "boss" && ch
        ? createEnemy({ ...ch.boss, tier: "boss" }, player.level, bossId(ch.id))
        : createEnemy(encounter, player.level, makeId("enemy"));
    turn.log("SYSTEM", `${TIERS[enemy.tier].label} encounter: ${enemy.name}`, "danger");
    extra.enemy = enemy;
    extra.mode = "COMBAT";
    extra.suggestions = [];
  } else {
    extra.suggestions = n.suggestions.length ? n.suggestions : state.suggestions;
  }
  return turn.result(extra);
}

async function combatTurn(
  state: GameSnapshot,
  player: Player,
  input: TurnInput,
  deps: EngineDeps,
  rng: Rng
): Promise<TurnResult> {
  const enemy = state.currentEnemy!;
  const turn = new Turn();
  const action: CombatAction =
    input.kind === "combat"
      ? input.action
      : input.kind === "use-item"
        ? { kind: "item", itemId: input.itemId }
        : input.kind === "text"
          ? parseCombatInput(input.text, player, state.inventory)
          : { kind: "defend" }; // "rest" in the middle of a fight means bracing
  const intent = input.kind === "text" ? input.text : input.kind === "combat" ? input.text : undefined;

  const round = resolveCombatRound(player, state.inventory, enemy, action, rng);
  turn.log("SYSTEM", describeRound(round, enemy).join("\n"), "roll");

  let narrative = "";
  try {
    const raw = (await deps.ai("combat", buildCombatMessages(state, enemy, round, intent))) as { narrative?: unknown };
    if (typeof raw?.narrative === "string") narrative = raw.narrative.trim();
  } catch {
    /* the dice already rolled — the round must resolve even without the narrator */
  }
  turn.log("AI", narrative || fallbackCombatNarrative(round, enemy));

  const extra: Omit<TurnResult, "id" | "timestamp" | "logs"> = { hpDelta: round.hpDelta, mpDelta: round.mpDelta };
  if (round.item && action.kind === "item") extra.removeItemIds = [action.itemId];

  if (round.enemyDefeated) {
    Object.assign(extra, { enemy: null, mode: "PLAYING", storyTurn: true, xpGain: enemy.xpReward, suggestions: AFTER_VICTORY });
    const rewards = [`+${enemy.xpReward} XP`];
    const ch = getChapter(state.chapter);
    if (ch && enemy.id === bossId(ch.id)) {
      const relic: Item = { id: makeId("relic"), ...ch.reward };
      extra.addItems = [relic];
      extra.chapterComplete = true;
      rewards.push(`obtained ${relic.name}`);
      turn.log("SYSTEM", `${ch.boss.name} falls. Chapter ${ch.id} complete.`, "reward");
    } else {
      const loot = rollLoot(enemy, effectiveStats(player, state.inventory).lck, rng);
      if (loot) {
        extra.addItems = [loot];
        rewards.push(`found ${loot.name}`);
      }
    }
    turn.log("SYSTEM", `Victory: ${rewards.join(", ")}.`, "reward");
  } else if (round.fled) {
    Object.assign(extra, { enemy: null, mode: "PLAYING", storyTurn: true, suggestions: AFTER_ESCAPE });
    turn.log("SYSTEM", `You escaped from ${enemy.name}.`, "info");
  } else {
    extra.enemy = { ...enemy, hp: round.enemyHpAfter };
    extra.mode = "COMBAT";
  }
  return turn.result(extra);
}
