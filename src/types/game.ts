export type GameState = "LANDING" | "CHARACTER_CREATION" | "PLAYING" | "GAMEOVER";

export type CharacterClass = "Chrono-Mage" | "Neural-Stalker" | "Rift-Knight";

export interface Stats {
  str: number;
  int: number;
  dex: number;
  lck: number;
}

export interface Player {
  name: string;
  class: CharacterClass;
  stats: Stats;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  level: number;
  portraitUrl?: string;
}

export type ItemType = "weapon" | "armor" | "consumable" | "artifact" | "key";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  statBonus?: Partial<Stats>;
  icon?: string;
}

export type LogSender = "SYSTEM" | "AI" | "PLAYER";

export interface LogMessage {
  id: string;
  sender: LogSender;
  text: string;
  timestamp: number;
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
}

export interface GameSnapshot {
  gameState: GameState;
  player: Player | null;
  inventory: Item[];
  gameLog: LogMessage[];
  currentLocation: Location;
  quests: Quest[];
}

export interface ClassDefinition {
  id: CharacterClass;
  tagline: string;
  description: string;
  baseStats: Stats;
  signature: string;
}

export const CLASS_DEFS: ClassDefinition[] = [
  {
    id: "Chrono-Mage",
    tagline: "Weaver of moments",
    description:
      "Bends time itself, slowing foes and replaying lost moves. Fragile of body, infinite of mind.",
    baseStats: { str: 4, int: 9, dex: 5, lck: 6 },
    signature: "Temporal Cascade",
  },
  {
    id: "Neural-Stalker",
    tagline: "Ghost in the signal",
    description:
      "A wetware-augmented infiltrator. Sees through walls, strikes from impossible angles.",
    baseStats: { str: 5, int: 6, dex: 9, lck: 4 },
    signature: "Spectral Hack",
  },
  {
    id: "Rift-Knight",
    tagline: "Bulwark of the void",
    description:
      "Forged in dimensional war. Carries a singularity blade. Walks where nothing else can.",
    baseStats: { str: 9, int: 4, dex: 5, lck: 6 },
    signature: "Voidstrike",
  },
];

export const STARTING_POINTS = 15;
export const MIN_STAT = 1;
export const MAX_STAT = 15;
