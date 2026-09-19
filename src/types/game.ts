export type GameState = "LANDING" | "CHARACTER_CREATION" | "PLAYING" | "COMBAT" | "GAMEOVER" | "VICTORY";

export type CharacterClass = "Chrono-Mage" | "Neural-Stalker" | "Rift-Knight";

export interface Stats {
  str: number;
  int: number;
  dex: number;
  lck: number;
}

export type StatKey = keyof Stats;

export interface Player {
  name: string;
  class: CharacterClass;
  stats: Stats;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** XP toward the next level (resets on level-up). */
  xp: number;
  level: number;
  portraitUrl?: string;
  appearance?: string;
  statPoints: number;
}

export type EnemyTier = "minion" | "standard" | "elite" | "boss";

/** Lingering effects the player's abilities put on an enemy. */
export interface EnemyEffects {
  /** Rounds left attacking at disadvantage. */
  slowed?: number;
  poison?: { rounds: number; damage: number };
  /** Skips its next action. */
  stunned?: boolean;
  /** Stasis-type stuns work once per fight. */
  stunUsed?: boolean;
}

export interface Enemy {
  id: string;
  name: string;
  tier: EnemyTier;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  attackBonus: number;
  /** Damage per hit: 1d{damageDie} + damageBonus. */
  damageDie: number;
  damageBonus: number;
  xpReward: number;
  imageDescription: string;
  effects?: EnemyEffects;
  /** Rounds fought so far (drives boss special attacks). */
  round?: number;
  /** Bosses turn to phase 2 below half HP. */
  phase?: 1 | 2;
  bossPhase?: BossPhase;
}

/** What a boss becomes below half HP: stronger, with a special attack every other round. */
export interface BossPhase {
  name: string;
  description: string;
  special: {
    name: string;
    /** Damage: {dice}d{sides} + boss level. Halved if the player defends. */
    dice: number;
    sides: number;
    mpDrain?: number;
    /** Share of max HP the boss regains when it uses the special. */
    heal?: number;
  };
}

export type CompanionRole = "fighter" | "healer" | "mystic";

export interface Companion {
  id: string;
  name: string;
  role: CompanionRole;
  description: string;
  level: number;
  hp: number;
  maxHp: number;
  /** Knocked out: no actions until the player rests. */
  down: boolean;
}

export interface ShopItem {
  item: Item;
  price: number;
}

export interface Merchant {
  name: string;
  description: string;
  /** The location they trade at; walking away ends the deal. */
  location: string;
  stock: ShopItem[];
}

/** A place the player has been, for the atlas. */
export interface Place {
  name: string;
  description: string;
  imageDescription: string;
  chapter: number;
}

export type ItemType = "weapon" | "armor" | "consumable" | "artifact" | "key";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  statBonus?: Partial<Stats>;
  /** Armor class bonus while equipped (armor only). */
  armorBonus?: number;
  /** What using a consumable restores. */
  effect?: { hp?: number; mp?: number };
  equipped?: boolean;
}

export type LogSender = "SYSTEM" | "AI" | "PLAYER";
/** Visual flavour for SYSTEM lines. "error" = out-of-game problem, never shown to the AI. */
export type LogTone = "info" | "roll" | "reward" | "danger" | "error";

/** One visible d20 roll, carried by "roll" log lines so the UI can animate it. */
export interface DiceRoll {
  who: "player" | "enemy" | "ally";
  kind: "attack" | "check" | "escape";
  label: string;
  natural: number;
  bonus: number;
  /** AC or DC the total was compared to. */
  target: number;
  outcome: "success" | "failure" | "critical" | "fumble";
}

export interface LogMessage {
  id: string;
  sender: LogSender;
  text: string;
  timestamp: number;
  tone?: LogTone;
  dice?: DiceRoll[];
}

export interface Location {
  name: string;
  description: string;
  imageDescription: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed";
  /** Main-story quests are completed by the code (chapter boss), never by the narrator. */
  main?: boolean;
}

export interface GameSnapshot {
  version: 2;
  gameState: GameState;
  player: Player | null;
  inventory: Item[];
  gameLog: LogMessage[];
  currentLocation: Location;
  quests: Quest[];
  currentEnemy: Enemy | null;
  /** 1-based chapter index; CHAPTERS.length + 1 means the main story is finished. */
  chapter: number;
  /** Story turns taken in the current chapter — gates the chapter boss. */
  turnsInChapter: number;
  /** Running summary of the adventure, fed to the narrator as long-term memory. */
  chronicle: string;
  /** Id of the last gameLog entry the chronicle covers ("" = none yet). */
  chronicleUpTo: string;
  /** Next-action ideas proposed by the narrator. */
  suggestions: string[];
  /** Aether shards: the currency. */
  shards: number;
  merchant: Merchant | null;
  companion: Companion | null;
  visited: Place[];
}

export interface ClassDefinition {
  id: CharacterClass;
  tagline: string;
  description: string;
  baseStats: Stats;
  primary: StatKey;
  signature: string;
  signatureText: string;
  growth: { hp: number; mp: number };
}

export const CLASS_DEFS: ClassDefinition[] = [
  {
    id: "Chrono-Mage",
    tagline: "Weaver of moments",
    description:
      "Bends time itself, slowing foes and replaying lost moves. Fragile of body, infinite of mind.",
    baseStats: { str: 4, int: 9, dex: 5, lck: 6 },
    primary: "int",
    signature: "Temporal Cascade",
    signatureText: "Guaranteed hit (2d8 + INT + level). Time slows: the enemy strikes back at disadvantage.",
    growth: { hp: 7, mp: 8 },
  },
  {
    id: "Neural-Stalker",
    tagline: "Ghost in the signal",
    description:
      "A wetware-augmented infiltrator. Sees through walls, strikes from impossible angles.",
    baseStats: { str: 5, int: 6, dex: 9, lck: 4 },
    primary: "dex",
    signature: "Spectral Hack",
    signatureText: "Guaranteed critical strike (3d8 + DEX + level). The heaviest burst in the game.",
    growth: { hp: 9, mp: 6 },
  },
  {
    id: "Rift-Knight",
    tagline: "Bulwark of the void",
    description:
      "Forged in dimensional war. Carries a singularity blade. Walks where nothing else can.",
    baseStats: { str: 9, int: 4, dex: 5, lck: 6 },
    primary: "str",
    signature: "Voidstrike",
    signatureText: "Guaranteed hit (2d10 + STR + level). Heals you for a third of the damage dealt.",
    growth: { hp: 11, mp: 4 },
  },
];

export const STARTING_POINTS = 15;
export const MIN_STAT = 1;
export const MAX_STAT = 15;

export function classDef(id: CharacterClass): ClassDefinition {
  return CLASS_DEFS.find((c) => c.id === id) ?? CLASS_DEFS[0];
}
