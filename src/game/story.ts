import type { BossPhase, Item, Quest } from "@/types/game";

/** A decision the world remembers. The narrator may set it; the endings read it back. */
export interface StoryChoice {
  id: string;
  /** Shown to the player in the chronicle ("What you did"). */
  label: string;
  /** Told to the narrator: when this becomes true. */
  when: string;
}

/** An optional scene a run may or may not contain. Two per chapter are drawn at random. */
export interface StoryBeat {
  id: string;
  /** Told to the narrator: something to work into this chapter. */
  hook: string;
}

export interface Chapter {
  id: number;
  title: string;
  questTitle: string;
  goal: string;
  /** Private direction for the narrator: setting, cast, and where the chapter is heading. */
  guidance: string;
  /** Story turns before the boss may appear. */
  minTurns: number;
  boss: { name: string; imageDescription: string; phase2: BossPhase };
  reward: Omit<Item, "id">;
  /** What this chapter can be remembered for. */
  choices: StoryChoice[];
  /** Optional scenes; a run draws two of them. */
  beats: StoryBeat[];
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
      phase2: {
        name: "The Bell Tolls",
        description: "Its halo shatters and the bell-head begins to ring, each toll a shockwave through the glass.",
        special: { name: "Tolling Shockwave", dice: 2, sides: 6 },
      },
    },
    reward: {
      name: "Bell-Shard of the Gatewarden",
      type: "artifact",
      description: "A sliver of tuned bronze. It hums when danger is near.",
      statBonus: { lck: 1, int: 1 },
    },
    choices: [
      { id: "spared-gatewarden", label: "Spared the Gatewarden", when: "the player lets the Gatewarden's core survive, or shows it mercy instead of finishing it" },
      { id: "silenced-bells", label: "Silenced the tolling bells", when: "the player destroys, muffles or stops the Hall of Tolling Bells rather than leaving them ringing" },
      { id: "woke-sentinels", label: "Woke the sleeping sentinels", when: "the player rouses the dormant sentinels, whether by accident or on purpose" },
    ],
    beats: [
      { id: "cartographer", hook: "A dying sentinel-cartographer whose map of the halls is sung in bell-tones, not drawn." },
      { id: "mirror-well", hook: "A well of standing water that shows the player's reflection wearing a name they cannot read." },
      { id: "glass-orphan", hook: "A child of blown glass who has hidden here since the clocks stopped and knows a way through the walls." },
      { id: "hungry-door", hook: "A door that only opens for a memory, and keeps whatever it is given." },
    ],
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
      phase2: {
        name: "Crescendo",
        description: "The choir fuses into a single shrieking chord that tears at thought itself.",
        special: { name: "Screaming Chorus", dice: 2, sides: 6, mpDrain: 6 },
      },
    },
    reward: {
      name: "Sable's Memory Lens",
      type: "artifact",
      description: "A cracked monocle that shows the echoes of past moments.",
      statBonus: { int: 1, dex: 1 },
    },
    choices: [
      { id: "paid-sable", label: "Paid Mother Sable's price", when: "the player pays what Mother Sable asks in full — shards, a memory, or the favour she demands" },
      { id: "cheated-sable", label: "Cheated Mother Sable", when: "the player lies to, robs, threatens or betrays Mother Sable" },
      { id: "freed-choir", label: "Freed the Choir of Static", when: "the player releases or reconciles the Choir instead of simply destroying it" },
      { id: "market-friends", label: "Won the market's loyalty", when: "the scavengers or traders of the Drowned Market openly side with the player" },
    ],
    beats: [
      { id: "vial-thief", hook: "A pickpocket hawking stolen memories in vials, one of which flickers with the player's own face." },
      { id: "backwards-alley", hook: "An alley where time runs backwards: a body un-dies every hour, and can be questioned before it does." },
      { id: "tide-auction", hook: "An auction held at low tide where debts are settled in years of life." },
      { id: "static-preacher", hook: "A preacher who insists the Choir of Static is a god the city should be kneeling to." },
    ],
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
      phase2: {
        name: "Unwound Time",
        description: "The Regent tears open its own stopped heart and drinks the seconds it has hoarded.",
        special: { name: "Stolen Moment", dice: 2, sides: 8, heal: 0.08 },
      },
    },
    reward: {
      name: "Your True Name",
      type: "artifact",
      description: "Reclaimed at last. The Rift remembers you now.",
      statBonus: { str: 1, int: 1, dex: 1, lck: 1 },
    },
    choices: [
      { id: "spared-regent", label: "Spared the Hollow Regent", when: "the player offers the Regent peace, mercy or release instead of destroying it outright" },
      { id: "took-crown", label: "Took the hollow crown", when: "the player claims the Regent's power, crown or hoard of stolen time for themselves" },
      { id: "freed-clocks", label: "Let time run again", when: "the player restarts Xianthia's clocks for everyone, even at a personal cost" },
      { id: "kept-name-hidden", label: "Kept their name unspoken", when: "the player refuses to speak their true name aloud, or gives it away to someone else" },
    ],
    beats: [
      { id: "frozen-second", hook: "A floor of the Spire stopped mid-disaster, where saving anyone means unfreezing all of it." },
      { id: "regents-clerk", hook: "The Regent's own clerk, still filing stolen names, who would rather be released than defended." },
      { id: "other-claimant", hook: "Another nameless climber racing the player to the summit for the same crown." },
      { id: "bell-echo", hook: "An echo of the Gatewarden's bell ringing somewhere above, impossibly, floors ahead of the player." },
    ],
  },
];

/**
 * How Chronicle 0 ends. The first ending whose flags all match wins, so the
 * list runs from the most specific to the plain one.
 */
export interface Ending {
  id: string;
  title: string;
  requires: string[];
  /** Direction for the epilogue writer. */
  tone: string;
}

export const ENDINGS: Ending[] = [
  {
    id: "new-regent",
    title: "The New Regent",
    requires: ["took-crown"],
    tone: "The player wears the hollow crown. Xianthia's hours answer to them now — and the city cannot tell whether it has been saved or inherited. Ambiguous, cold, a little seductive.",
  },
  {
    id: "mercy-of-hours",
    title: "The Mercy of Hours",
    requires: ["spared-regent"],
    tone: "The Regent was released rather than broken. Time resumes slowly, grief and relief together, and something of the old guardian lingers in the city's bells.",
  },
  {
    id: "clockbreaker",
    title: "The Clockbreaker",
    requires: ["freed-clocks"],
    tone: "Time runs again for everyone, and the player paid for it. Triumphant but costly: the city wakes, and the player is changed.",
  },
  {
    id: "nameless-victor",
    title: "The Nameless Victor",
    requires: ["kept-name-hidden"],
    tone: "The Regent falls, but the player never speaks their name aloud. They walk out of the Spire unnamed and unclaimed, free in a lonely way.",
  },
  {
    id: "name-reclaimed",
    title: "The Name Reclaimed",
    requires: [],
    tone: "The player takes back what was stolen. Hard-won, warm, the city's clocks stuttering back to life around them.",
  },
];

export const ALL_CHOICES: StoryChoice[] = CHAPTERS.flatMap((c) => c.choices);

export function choiceLabel(id: string): string | undefined {
  return ALL_CHOICES.find((c) => c.id === id)?.label;
}

/** The ending earned by the flags collected along the way. */
export function chooseEnding(flags: string[]): Ending {
  return ENDINGS.find((e) => e.requires.every((f) => flags.includes(f)))!;
}

/** Draws this run's threads for a chapter: two of its four, in a random order. */
export function drawBeats(chapter: number, rng: () => number = Math.random): string[] {
  const pool = [...(getChapter(chapter)?.beats ?? [])];
  const drawn: string[] = [];
  while (pool.length && drawn.length < 2) drawn.push(...pool.splice(Math.floor(rng() * pool.length), 1).map((b) => b.id));
  return drawn;
}

export function beatHooks(chapter: number, ids: string[]): string[] {
  const beats = getChapter(chapter)?.beats ?? [];
  return ids.map((id) => beats.find((b) => b.id === id)?.hook).filter((h): h is string => Boolean(h));
}

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
