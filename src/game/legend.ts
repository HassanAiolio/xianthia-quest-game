import type { GameSnapshot } from "@/types/game";
import { DIFFICULTIES } from "./difficulty";
import { CHAPTERS, choiceLabel, chooseEnding, getChapter } from "./story";

/** One line of the run's record: what it is, and what it came to. */
export interface LegendLine {
  label: string;
  value: string;
}

export interface Legend {
  title: string;
  /** "Rift-Knight, level 7 · Hardcore · fell in the Drowned Market" */
  subtitle: string;
  lines: LegendLine[];
  choices: string[];
  /** The epilogue, when the run is over. */
  closing: string;
}

function outcome(state: GameSnapshot): string {
  if (state.gameState === "GAMEOVER") {
    const chapter = getChapter(state.chapter);
    return `fell in ${chapter ? chapter.title : "the last chapter"}`;
  }
  if (state.chapter > CHAPTERS.length) return chooseEnding(state.flags).title;
  return "still walking";
}

/** Everything the legend page and the shareable text are built from. */
export function buildLegend(state: GameSnapshot): Legend {
  const player = state.player!;
  const chapters = Math.min(state.chapter, CHAPTERS.length);
  const days = Math.max(1, Math.round((Date.now() - state.stats.started) / 86_400_000));

  return {
    title: `The Legend of ${player.name}`,
    subtitle: `${player.class}, level ${player.level} · ${DIFFICULTIES[state.difficulty].label} · ${outcome(state)}`,
    lines: [
      { label: "Chapters", value: `${state.chapter > CHAPTERS.length ? CHAPTERS.length : chapters} of ${CHAPTERS.length}` },
      { label: "Turns taken", value: String(state.stats.turns) },
      { label: "Foes defeated", value: String(state.stats.kills) },
      { label: "Bosses felled", value: String(state.stats.bosses) },
      { label: "Hardest blow", value: `${state.stats.biggestHit} damage` },
      { label: "Shards earned", value: String(state.stats.shardsEarned) },
      { label: "Places found", value: String(state.visited.length) },
      { label: "Ally", value: state.companion ? `${state.companion.name}, the ${state.companion.role}` : "none" },
      { label: "Days in the Rift", value: days === 1 ? "1" : String(days) },
    ],
    choices: state.flags.map((f) => choiceLabel(f)).filter((l): l is string => Boolean(l)),
    closing: state.epilogue?.text ?? "",
  };
}

/** The legend as plain text, for pasting anywhere. */
export function legendText(state: GameSnapshot): string {
  const legend = buildLegend(state);
  const parts = [
    legend.title,
    legend.subtitle,
    "",
    ...legend.lines.map((l) => `${l.label}: ${l.value}`),
  ];
  if (legend.choices.length) parts.push("", "What they did:", ...legend.choices.map((c) => `- ${c}`));
  if (legend.closing) parts.push("", legend.closing);
  parts.push("", "Xianthia Quest");
  return parts.join("\n");
}
