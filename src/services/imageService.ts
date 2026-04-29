const BASE_URL = "https://image.pollinations.ai/prompt";

function buildUrl(prompt: string, width: number, height: number): string {
  const encoded = encodeURIComponent(prompt);
  return `${BASE_URL}/${encoded}?model=flux&width=${width}&height=${height}&seed=${Math.floor(Math.random() * 999999)}&referrer=pollinations.ai`;
}

export function getPortraitUrl(
  name: string,
  characterClass: string,
  appearance: string
): string {
  const classPrompts: Record<string, string> = {
    "Chrono-Mage": "robed mage glowing hourglass staff time magic purple energy",
    "Neural-Stalker": "cyberpunk infiltrator wetware implants stealth dark hood neon",
    "Rift-Knight": "armored knight singularity blade void energy dark plate armor",
  };

  const classDetail = classPrompts[characterClass] ?? characterClass;
  const appearanceDetail = appearance.trim() ? `, ${appearance.trim()}` : "";

  const prompt = `pixel art 16bit portrait bust shot, ${name}, ${classDetail}${appearanceDetail}, dark cyberpunk fantasy background, dramatic lighting, detailed face, RPG character art style`;

  return buildUrl(prompt, 512, 512);
}

export function getLocationImageUrl(imageDescription: string): string {
  const prompt = `pixel art 16bit wide landscape, ${imageDescription}, dark cyberpunk fantasy world, atmospheric, dramatic lighting, detailed environment, RPG background art style`;
  return buildUrl(prompt, 896, 448);
}