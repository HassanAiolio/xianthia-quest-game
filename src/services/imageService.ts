const HF_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";

async function fetchImage(prompt: string, width: number, height: number): Promise<string> {
  const response = await fetch(HF_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${import.meta.env.VITE_HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { width, height, num_inference_steps: 4 },
    }),
  });

  if (!response.ok) throw new Error(`HF error: ${response.status}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
export async function getPortraitUrl(
  name: string,
  characterClass: string,
  appearance: string
): Promise<string> {
  const classPrompts: Record<string, string> = {
    "Chrono-Mage": "robed mage glowing hourglass staff time magic purple energy",
    "Neural-Stalker": "cyberpunk infiltrator wetware implants stealth dark hood neon",
    "Rift-Knight": "armored knight singularity blade void energy dark plate armor",
  };

  const classDetail = classPrompts[characterClass] ?? characterClass;
  const appearanceDetail = appearance.trim() ? `, ${appearance.trim()}` : "";
  const prompt = `pixel art 16bit portrait bust shot, ${name}, ${classDetail}${appearanceDetail}, dark cyberpunk fantasy background, dramatic lighting, detailed face, RPG character art style`;

  return fetchImage(prompt, 512, 512);
}

export async function getLocationImageUrl(imageDescription: string): Promise<string> {
  const prompt = `pixel art 16bit wide landscape, ${imageDescription}, dark cyberpunk fantasy world, atmospheric, dramatic lighting, detailed environment, RPG background art style`;
  return fetchImage(prompt, 896, 448);
}