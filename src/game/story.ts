import type { Item, Quest } from "@/types/game";

export interface Chapter {
  id: number;
  title: string;
  questTitle: string;
  goal: string;
  /** Private direction for the narrator: setting, cast, and where the chapter is heading. */
  guidance: string;
  /** Story turns before the boss may appear. */
  minTurns: number;
  boss: { name: string; imageDescription: string };
  reward: Omit<Item, "id">;
}

/** Chronicle 0 — a three-chapter spine. Beating a chapter's boss completes its main quest. */
export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    title: "The Obsidian Antechamber",
    questTitle: "Awaken in Xianthia",
    goal: "Find a way out of the Antechamber and locate the Rift Gate.",
    guidance:
      "The player woke with no memory in a cathedral of black glass beneath the city of Xianthia, where time is broken. Let them explore halls of echoes, dormant sentinels and glyph-locked doors. Seed clues that the Rift Gate lies beyond the Hall of Tolling Bells, that a guardian called the Gatewarden keeps it sealed, and that the player's true name was taken from them.",
    minTurns: 6,
    boss: {
      name: "The Gatewarden",
      imageDescription:
        "towering sentinel of black glass with a cracked cyan halo and a great bronze bell in place of a head",
    },
    reward: {
      name: "Bell-Shard of the Gatewarden",
      type: "artifact",
      description: "A sliver of tuned bronze. It hums when danger is near.",
      statBonus: { lck: 1, int: 1 },
    },
  },
  {
    id: 2,
    title: "The Drowned Market",
    questTitle: "The Archivist's Price",
    goal: "Find the archivist Mother Sable in the flooded bazaar of Lower Xianthia and learn who stole your name.",
    guidance:
      "Beyond the Rift Gate lies Lower Xianthia: a half-flooded neon bazaar where merchants trade memories in glass vials and some alleys run backwards in time. Mother Sable, a blind archivist, knows who took the player's name but wants a favour first. Introduce rival scavengers, a memory-dealer who lies, and whispers of the Hollow Regent who froze the city's clocks. The climax is the Choir of Static, the archive's corrupted guardian.",
    minTurns: 8,
    boss: {
      name: "The Choir of Static",
      imageDescription: "a swarm of broken holographic singers fused into one screaming shape of static and neon",
    },
    reward: {
      name: "Sable's Memory Lens",
      type: "artifact",
      description: "A cracked monocle that shows the echoes of past moments.",
      statBonus: { int: 1, dex: 1 },
    },
  },
  {
    id: 3,
    title: "The Clockless Spire",
    questTitle: "The Hollow Regent",
    goal: "Climb the Clockless Spire and confront the Hollow Regent, who froze Xianthia's clocks and stole your name.",
    guidance:
      "The Spire is a vertical labyrinth where each floor is stuck at a different second. The Hollow Regent was once the city's guardian: it stopped time to save Xianthia from ending and has fed on stolen names ever since. Let the player uncover this, find allies or bargains, and choose how to face the Regent. The climax is the Hollow Regent at the Spire's summit.",
    minTurns: 10,
    boss: {
      name: "The Hollow Regent",
      imageDescription: "a gaunt crowned figure made of stopped clock hands and hollow light, robes of frozen smoke",
    },
    reward: {
      name: "Your True Name",
      type: "artifact",
      description: "Reclaimed at last. The Rift remembers you now.",
      statBonus: { str: 1, int: 1, dex: 1, lck: 1 },
    },
  },
];

export const mainQuestId = (chapter: number): string => `main-${chapter}`;
export const bossId = (chapter: number): string => `boss-ch${chapter}`;

export function getChapter(chapter: number): Chapter | null {
  return CHAPTERS[chapter - 1] ?? null;
}

export function chapterQuest(ch: Chapter): Quest {
  return { id: mainQuestId(ch.id), title: ch.questTitle, description: ch.goal, status: "active", main: true };
}

export function climaxReady(chapter: number, turnsInChapter: number): boolean {
  const ch = getChapter(chapter);
  return ch !== null && turnsInChapter >= ch.minTurns;
}
