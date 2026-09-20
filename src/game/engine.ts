import type { DiceRoll, GameSnapshot, Item, LogMessage, LogSender, LogTone, PendingCheck, Player, Square } from "@/types/game";
import type { AiRunner } from "@/services/ai";
import { signatureAbility, unlockedAbilities } from "./abilities";
import { checkDice, describeCheck, pendingCheckFor, rollCheck, type CheckResult } from "./checks";
import { ROLE_LABEL, createCompanion, restCompanion } from "./companions";
import { rulesFor } from "./difficulty";
import { generateStock, shardReward } from "./economy";
import {
  attackDie,
  describeAttack,
  describeRound,
  fallbackCombatNarrative,
  opportunityAttack,
  playerOpportunityAttack,
  resolveCombatRound,
  roundDice,
  type AttackRoll,
  type CombatAction,
  type Tactics,
} from "./combat";
import {
  MELEE_REACH,
  SPECIAL_RANGE,
  approach,
  retreat,
  coverBonus,
  createBattlefield,
  dist,
  enemySpeed,
  key,
  playerSpeed,
  provokes,
  reachable,
  same,
} from "./battlefield";
import { clamp, makeId, type Rng } from "./dice";
import { TIERS, createEnemy, type EnemySpec } from "./enemies";
import { parseCombatInput, parseExploreInput } from "./intent";
import { rollLoot } from "./items";
import { buildCombatMessages, buildNarrateMessages, checkOutcomeNote } from "./prompts";
import { sanitizeCheck, sanitizeNarration } from "./sanitize";
import { effectiveStats, scaleReward } from "./stats";
import { bossId, choiceLabel, climaxReady, getChapter } from "./story";
import type { TurnResult } from "./turn";

export type TurnInput =
  | { kind: "text"; text: string }
  /** `moveTo` is the square the player walked to before acting. */
  | { kind: "combat"; action: CombatAction; text?: string; moveTo?: Square }
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

  log(sender: LogSender, text: string, tone?: LogTone, dice?: DiceRoll[]) {
    this.logs.push({ id: makeId("log"), sender, text, tone, timestamp: this.timestamp, ...(dice?.length ? { dice } : {}) });
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
  const rules = rulesFor(state.difficulty);
  const ambushed = rng() < clamp(rules.ambush - 0.01 * lck, 0.05, rules.ambush);
  const hp = Math.min(Math.ceil(player.maxHp * (ambushed ? rules.restHeal / 2 : rules.restHeal)), player.maxHp - player.hp);
  const mp = Math.min(Math.ceil(player.maxMp * (ambushed ? 0.25 : 0.5)), player.maxMp - player.mp);
  const note = ambushed
    ? "The player tries to rest but is ambushed partway through. You MUST set an encounter (tier minion or standard) and describe only the moment the ambush begins."
    : "The player rests safely and recovers. Nothing attacks: encounter must be null. Describe the rest and one small detail that moves the story forward.";

  const result = await narrateTurn(state, player, "Rest and recover my strength.", deps, {
    note,
    forceEncounter: ambushed,
    forbidEncounter: !ambushed,
    allowCheck: false,
    fallbackNarrative: ambushed
      ? "Your eyes have barely closed when something shifts in the dark."
      : "You find a quiet corner and let the hum of the glass lull you. For a while, nothing hunts you.",
  });
  // Rest recovery is decided here, not by the narrator.
  result.hpDelta = hp;
  result.mpDelta = mp;
  if (state.companion && result.companion === undefined) result.companion = restCompanion(state.companion);
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
  /** Resting is resolved by the engine: no ability checks there. */
  allowCheck?: boolean;
  /** The check already paid XP: ignore whatever the narrator proposes on top. */
  suppressNarratorXp?: boolean;
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
  const ctx = { player, inventory: state.inventory, quests: state.quests, climaxReady: ready };

  let raw: unknown;
  try {
    raw = await deps.ai("narrate", buildNarrateMessages(state, action, opts.note));
  } catch (err) {
    if (opts.fallbackNarrative === undefined) throw err;
    raw = { narrative: opts.fallbackNarrative };
  }

  // The narrator asked for an ability check: show the attempt and hand the die to the player.
  const check = opts.allowCheck === false ? null : sanitizeCheck(raw);
  if (check) {
    const setup = sanitizeNarration(raw, ctx).narrative;
    if (setup) turn.log("AI", setup);
    return turn.result({ pendingCheck: pendingCheckFor(player, state.inventory, check, action, setup) });
  }

  const n = sanitizeNarration(raw, ctx);
  turn.log("AI", n.narrative || opts.fallbackNarrative || "The glyphs pulse, patient. Nothing answers — yet.");
  const extra: Omit<TurnResult, "id" | "timestamp" | "logs"> = { storyTurn: true };
  // After a check, its own reward already paid out: ignore the narrator's discovery XP.
  let xp = opts.suppressNarratorXp ? 0 : n.xpAward;

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

  const newFlags = n.flagsSet.filter((f) => !state.flags.includes(f));
  if (newFlags.length) {
    extra.flags = newFlags;
    for (const f of newFlags) turn.log("SYSTEM", `The Rift remembers: ${choiceLabel(f)?.toLowerCase()}.`, "info");
  }
  if (n.shardsFound) {
    extra.shardsDelta = n.shardsFound;
    turn.log("SYSTEM", `+${n.shardsFound} shards`, "reward");
  }
  const here = (n.location ?? state.currentLocation).name;
  if (n.merchant && !(state.merchant && state.merchant.location === here)) {
    extra.merchant = { ...n.merchant, location: here, stock: generateStock(player.level, player.class, deps.rng ?? Math.random) };
    turn.log("SYSTEM", `${n.merchant.name} is willing to trade. Open the Trade tab.`, "info");
  }
  if (n.companionJoins && !state.companion) {
    extra.companion = createCompanion(n.companionJoins, player.level, makeId("ally"));
    turn.log("SYSTEM", `${n.companionJoins.name} joins you as your ${ROLE_LABEL[n.companionJoins.role].toLowerCase()}.`, "reward");
  } else if (n.companionLeaves && state.companion) {
    extra.companion = null;
    turn.log("SYSTEM", `${state.companion.name} leaves your side.`, "info");
  }

  let encounter = opts.forbidEncounter ? null : n.encounter;
  if (opts.forceEncounter && !encounter) encounter = FALLBACK_AMBUSHER;
  if (encounter) {
    const ch = getChapter(state.chapter);
    const ally = extra.companion !== undefined ? extra.companion : state.companion;
    const withAlly = { companion: Boolean(ally && !ally.down), damageScale: rulesFor(state.difficulty).enemyDamage };
    const enemy =
      encounter.tier === "boss" && ch
        ? createEnemy({ ...ch.boss, tier: "boss" }, player.level, bossId(ch.id), withAlly)
        : createEnemy(encounter, player.level, makeId("enemy"), withAlly);
    turn.log("SYSTEM", `${TIERS[enemy.tier].label} encounter: ${enemy.name}`, "danger");
    extra.enemy = enemy;
    extra.battlefield = createBattlefield(Math.random, { ally: withAlly.companion });
    extra.mode = "COMBAT";
    extra.suggestions = [];
  } else {
    extra.suggestions = n.suggestions.length ? n.suggestions : state.suggestions;
  }
  return turn.result(extra);
}

/**
 * The player pressed "roll": the die and its XP land immediately, so the animation
 * can start while the narrator works out what the result means.
 */
export function rollPendingCheck(state: GameSnapshot, rng: Rng = Math.random): { result: CheckResult; turn: TurnResult } {
  const player = state.player!;
  const pending = state.pendingCheck!;
  const turn = new Turn();
  const result = rollCheck(player, state.inventory, pending, rng);
  turn.log("SYSTEM", describeCheck(result), "roll", [checkDice(result, true)]);
  if (result.xp) turn.log("SYSTEM", `+${result.xp} XP`, "reward");
  return { result, turn: turn.result({ pendingCheck: null, ...(result.xp ? { xpGain: result.xp } : {}) }) };
}

/** …and then the narrator says what that roll meant. */
export function narrateCheckOutcome(state: GameSnapshot, pending: PendingCheck, result: CheckResult, deps: EngineDeps): Promise<TurnResult> {
  return narrateTurn(state, state.player!, pending.action, deps, {
    note: checkOutcomeNote(result, pending.setup),
    allowCheck: false,
    suppressNarratorXp: true,
  });
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

  // ── The board: walk first, then act, then the enemy answers ───────────────
  const ally = state.companion && !state.companion.down ? state.companion : null;
  let field = state.battlefield ?? createBattlefield(Math.random, { ally: Boolean(ally) });
  const speed = playerSpeed();
  let spent = 0;

  // A step out of a melee's reach is a free swing for it.
  const wanted = input.kind === "combat" ? input.moveTo : undefined;
  let opportunity: AttackRoll | null = null;
  if (wanted && reachable(field, field.player, speed).has(key(wanted))) {
    spent = reachable(field, field.player, speed).get(key(wanted))!;
    if (provokes(field.player, wanted, field.enemy) && !enemy.effects?.stunned) {
      opportunity = opportunityAttack(player, state.inventory, enemy, rng);
      turn.log("SYSTEM", describeAttack(`${enemy.name} strikes as you break away`, opportunity), "roll", [
        attackDie("enemy", `${enemy.name} - opportunity`, opportunity),
      ]);
    }
    field = { ...field, player: wanted };
    turn.log("SYSTEM", `You move ${spent} square${spent === 1 ? "" : "s"}.`, "info");
  }

  // Reaching the enemy is part of the action: a swing implies the steps that set it up.
  const range = actionRange(action, player);
  let inRange = true;
  if (range > 0 && dist(field.player, field.enemy) > range) {
    const walk = approach(field, field.player, field.enemy, speed - spent, range);
    inRange = walk.inRange;
    if (!same(walk.to, field.player)) {
      field = { ...field, player: walk.to };
      turn.log("SYSTEM", `You advance ${walk.spent} square${walk.spent === 1 ? "" : "s"}.`, "info");
    }
    if (!inRange) {
      turn.log("SYSTEM", `${enemy.name} is still ${dist(field.player, field.enemy)} squares off — you keep running.`, "info");
    }
  }
  const resolved: CombatAction = inRange ? action : { kind: "dash" };

  // The free swing can finish a wounded player before they ever act.
  const hpAfterOpportunity = Math.max(0, player.hp - (opportunity?.damage ?? 0));
  if (hpAfterOpportunity <= 0) {
    turn.log("SYSTEM", `${enemy.name} cuts you down as you turn to run.`, "danger");
    return turn.result({ hpDelta: -player.hp, battlefield: field });
  }
  const actor = opportunity?.damage ? { ...player, hp: hpAfterOpportunity } : player;

  // Allies keep up on their own; a fighter needs to be next to the enemy, the rest can shoot.
  let allyInRange = true;
  if (ally && field.ally) {
    const allyWalk = approach(field, field.ally, field.enemy, 6, ally.role === "fighter" ? MELEE_REACH : 6);
    field = { ...field, ally: allyWalk.to };
    allyInRange = allyWalk.inRange;
  }

  // Cover for the player's shot is read before the enemy moves: the player acts first.
  const enemyCover = coverBonus(field, field.player, field.enemy);
  const enemyFrom = field.enemy;
  const reach = enemy.ranged ?? MELEE_REACH;
  let quarry = enemy; // a shooter that backs off can take a parting blow on the way
  if (!enemy.effects?.stunned) {
    const hunted = ally && field.ally && dist(field.enemy, field.ally) < dist(field.enemy, field.player) ? field.ally : field.player;
    const gap = dist(field.enemy, hunted);
    if (enemy.ranged && gap <= MELEE_REACH) {
      // Too close to shoot comfortably: it gives ground, and you get a swing at it.
      const back = retreat(field, field.enemy, hunted, enemySpeed(enemy.tier), enemy.ranged);
      if (!same(back.to, field.enemy)) {
        if (provokes(field.enemy, back.to, field.player)) {
          const swing = playerOpportunityAttack(player, state.inventory, enemy, rng);
          quarry = { ...enemy, hp: Math.max(0, enemy.hp - swing.damage) };
          turn.log("SYSTEM", describeAttack(`You strike as ${enemy.name} gives ground`, swing), "roll", [
            attackDie("player", "Opportunity attack", swing),
          ]);
        }
        field = { ...field, enemy: back.to };
        turn.log("SYSTEM", `${enemy.name} backs off ${back.spent} square${back.spent === 1 ? "" : "s"} and takes aim.`, "info");
      }
    } else if (gap > reach) {
      const chase = approach(field, field.enemy, hunted, enemySpeed(enemy.tier), reach);
      if (!same(chase.to, field.enemy)) {
        field = { ...field, enemy: chase.to };
        turn.log("SYSTEM", `${enemy.name} advances ${chase.spent} square${chase.spent === 1 ? "" : "s"}.`, "info");
      }
    }
  }
  const enemyReaches: ("player" | "companion")[] = [];
  if (dist(field.enemy, field.player) <= reach) enemyReaches.push("player");
  if (field.ally && dist(field.enemy, field.ally) <= reach) enemyReaches.push("companion");
  const tactics: Tactics = {
    enemyCover,
    playerCover: coverBonus(field, field.enemy, field.player),
    enemyReaches,
    specialInRange: dist(field.enemy, field.player) <= SPECIAL_RANGE,
    allyInRange,
  };
  if (enemyCover) turn.log("SYSTEM", `${enemy.name} has cover: +2 AC against you.`, "info");
  if (tactics.playerCover) turn.log("SYSTEM", `You are behind cover: +2 AC.`, "info");

  const round = resolveCombatRound(actor, state.inventory, quarry, resolved, rng, state.companion, tactics);
  turn.log("SYSTEM", describeRound(round, enemy).join("\n"), "roll", roundDice(round, enemy));
  // Frozen enemies never took those steps.
  if (round.enemySkipped === "stunned") field = { ...field, enemy: enemyFrom };

  let narrative = "";
  try {
    const raw = (await deps.ai("combat", buildCombatMessages(state, enemy, round, intent))) as { narrative?: unknown };
    if (typeof raw?.narrative === "string") narrative = raw.narrative.trim();
  } catch {
    /* the dice already rolled — the round must resolve even without the narrator */
  }
  turn.log("AI", narrative || fallbackCombatNarrative(round, enemy));

  const extra: Omit<TurnResult, "id" | "timestamp" | "logs"> = {
    hpDelta: (opportunity?.damage ? hpAfterOpportunity - player.hp : 0) + round.hpDelta,
    mpDelta: round.mpDelta,
    damageDealt: round.damageDealt,
  };
  if (round.item && action.kind === "item") extra.removeItemIds = [action.itemId];
  const hurt = state.companion;
  if (hurt && (round.companionHpDelta || round.companionDown)) {
    extra.companion = { ...hurt, hp: Math.max(0, hurt.hp + round.companionHpDelta), down: hurt.down || round.companionDown };
  }
  if (round.phaseChange) turn.log("SYSTEM", `${enemy.name} enters its second phase: ${round.phaseChange.name}`, "danger");

  if (round.enemyDefeated) {
    const shards = shardReward(enemy, effectiveStats(player, state.inventory).lck, rng);
    Object.assign(extra, { enemy: null, battlefield: null, kill: true, mode: "PLAYING", storyTurn: true, xpGain: enemy.xpReward, shardsDelta: shards, suggestions: AFTER_VICTORY });
    const rewards = [`+${enemy.xpReward} XP`, `+${shards} shards`];
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
    Object.assign(extra, { enemy: null, battlefield: null, mode: "PLAYING", storyTurn: true, suggestions: AFTER_ESCAPE });
    turn.log("SYSTEM", `You escaped from ${enemy.name}.`, "info");
  } else {
    extra.enemy = round.enemyAfter;
    extra.battlefield = field;
    extra.mode = "COMBAT";
  }
  return turn.result(extra);
}

/** How close the player has to be for what they just asked to do. */
function actionRange(action: CombatAction, player: Player): number {
  if (action.kind === "attack") return MELEE_REACH;
  if (action.kind !== "ability") return 0;
  const ability = unlockedAbilities(player).find((a) => a.id === action.abilityId) ?? signatureAbility(player.class);
  // Not enough MP means it comes out as a plain swing, which has to be in reach.
  return player.mp < ability.mp ? MELEE_REACH : ability.range;
}
