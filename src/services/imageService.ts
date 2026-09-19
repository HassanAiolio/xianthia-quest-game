import type { CharacterClass, Enemy, Location } from "@/types/game";
import { hashSeed } from "@/game/dice";

type ImageKind = "portrait" | "enemy" | "scene";

/**
 * Images come from the server (/api/image), which holds the Hugging Face token and
 * caches each picture on disk. Same kind + subject + seed = same cached image.
 */
export function imageUrl(kind: ImageKind, subject: string, seed: number): string {
  return `/api/image?kind=${kind}&seed=${seed}&subject=${encodeURIComponent(subject.trim().slice(0, 300))}`;
}

const CLASS_LOOKS: Record<CharacterClass, string> = {
  "Chrono-Mage": "robed mage with a glowing hourglass staff, purple time magic",
  "Neural-Stalker": "cyberpunk infiltrator with wetware implants, dark hood, neon visor",
  "Rift-Knight": "armored knight with a singularity blade, dark plate armor crackling with void energy",
};

export function portraitUrl(cls: CharacterClass, appearance: string, seed: number): string {
  const look = appearance.trim() ? `${CLASS_LOOKS[cls]}, ${appearance.trim()}` : CLASS_LOOKS[cls];
  return imageUrl("portrait", look, seed);
}

export const sceneUrl = (loc: Location): string =>
  imageUrl("scene", loc.imageDescription || loc.name, hashSeed(loc.name));

export const enemyUrl = (enemy: Enemy): string =>
  imageUrl("enemy", enemy.imageDescription || enemy.name, hashSeed(enemy.id));
