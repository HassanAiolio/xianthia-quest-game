// src/services/imageService.ts

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

  // Pollinations.ai creates images directly from the URL. No API keys or fetch needed!
  const encodedPrompt = encodeURIComponent(prompt);
  // Using a random seed so characters with the same name look different
  const seed = Math.floor(Math.random() * 100000); 
  
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}`;
}

export async function getLocationImageUrl(imageDescription: string): Promise<string> {
  const prompt = `pixel art 16bit wide landscape, ${imageDescription}, dark cyberpunk fantasy world, atmospheric, dramatic lighting, detailed environment, RPG background art style`;
  
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 100000);

  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=896&height=448&nologo=true&seed=${seed}`;
}

export async function getEnemyImageUrl(imageDescription: string): Promise<string> {
  const prompt = `pixel art 16bit enemy sprite, ${imageDescription}, dark cyberpunk fantasy world, dynamic combat pose, detailed, RPG monster art style`;
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 100000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}`;
}