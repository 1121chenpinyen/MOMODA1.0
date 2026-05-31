// plantCatalog: mapping between tags, variants and local assets
export const ASSET_MAP: Record<string, any[]> = {
  eat1: [
    require("../assets/plant/eat1/tu.png"),
    require("../assets/plant/eat1/eat1-1.png"),
    require("../assets/plant/eat1/eat1-2.png"),
    require("../assets/plant/eat1/eat1-3.png"),
    require("../assets/plant/eat1/eat1-4.png"),
    require("../assets/plant/eat1/eat1-5.png"),
  ],
  eat2: [
    require("../assets/plant/eat2/tu.png"),
    require("../assets/plant/eat2/eat2-1.png"),
    require("../assets/plant/eat2/eat2-2.png"),
    require("../assets/plant/eat2/eat2-3.png"),
    require("../assets/plant/eat2/eat2-4.png"),
    require("../assets/plant/eat2/eat2-5.png"),
  ],
  mood1: [
    require("../assets/plant/mood1/tu.png"),
    require("../assets/plant/mood1/mood1-1.png"),
    require("../assets/plant/mood1/mood1-2.png"),
    require("../assets/plant/mood1/mood1-3.png"),
    require("../assets/plant/mood1/mood1-4.png"),
    require("../assets/plant/mood1/mood1-5.png"),
  ],
  mood2: [
    require("../assets/plant/mood2/tu.png"),
    require("../assets/plant/mood2/mood2-1.png"),
    require("../assets/plant/mood2/mood2-2.png"),
    require("../assets/plant/mood2/mood2-3.png"),
    require("../assets/plant/mood2/mood2-4.png"),
    require("../assets/plant/mood2/mood2-5.png"),
  ],
  love1: [
    require("../assets/plant/love1/tu.png"),
    require("../assets/plant/love1/love1-1.png"),
    require("../assets/plant/love1/love1-2.png"),
    require("../assets/plant/love1/love1-3.png"),
    require("../assets/plant/love1/love1-4.png"),
    require("../assets/plant/love1/love1-5.png"),
  ],
  love2: [
    require("../assets/plant/love2/tu.png"),
    require("../assets/plant/love2/love2-1.png"),
    require("../assets/plant/love2/love2-2.png"),
    require("../assets/plant/love2/love2-3.png"),
    require("../assets/plant/love2/love2-4.png"),
    require("../assets/plant/love2/love2-5.png"),
  ],
  sport1: [
    require("../assets/plant/sport1/tu.png"),
    require("../assets/plant/sport1/sport1-1.png"),
    require("../assets/plant/sport1/sport1-2.png"),
    require("../assets/plant/sport1/sport1-3.png"),
    require("../assets/plant/sport1/sport1-4.png"),
    require("../assets/plant/sport1/sport1-5.png"),
  ],
  sport2: [
    require("../assets/plant/sport2/tu.png"),
    require("../assets/plant/sport2/sport2-1.png"),
    require("../assets/plant/sport2/sport2-2.png"),
    require("../assets/plant/sport2/sport2-3.png"),
    require("../assets/plant/sport2/sport2-4.png"),
    require("../assets/plant/sport2/sport2-5.png"),
  ],
  entertainment1: [
    require("../assets/plant/entertainment1/tu.png"),
    require("../assets/plant/entertainment1/entertainment1-1.png"),
    require("../assets/plant/entertainment1/entertainment1-2.png"),
    require("../assets/plant/entertainment1/entertainment1-3.png"),
    require("../assets/plant/entertainment1/entertainment1-4.png"),
    require("../assets/plant/entertainment1/entertainment1-5.png"),
  ],
  entertainment2: [
    require("../assets/plant/entertainment2/tu.png"),
    require("../assets/plant/entertainment2/entertainment2-1.png"),
    require("../assets/plant/entertainment2/entertainment2-2.png"),
    require("../assets/plant/entertainment2/entertainment2-3.png"),
    require("../assets/plant/entertainment2/entertainment2-4.png"),
    require("../assets/plant/entertainment2/entertainment2-5.png"),
  ],
  pet1: [
    require("../assets/plant/pet1/tu.png"),
    require("../assets/plant/pet1/pet1-1.png"),
    require("../assets/plant/pet1/pet1-2.png"),
    require("../assets/plant/pet1/pet1-3.png"),
    require("../assets/plant/pet1/pet1-4.png"),
    require("../assets/plant/pet1/pet1-5.png"),
  ],
  pet2: [
    require("../assets/plant/pet2/tu.png"),
    require("../assets/plant/pet2/pet2-1.png"),
    require("../assets/plant/pet2/pet2-2.png"),
    require("../assets/plant/pet2/pet2-3.png"),
    require("../assets/plant/pet2/pet2-4.png"),
    require("../assets/plant/pet2/pet2-5.png"),
  ],
};

// 這些分類會自動生成植物，且從對應兩個變體隨機選 1 個
export const TAG_TO_VARIANTS: Record<string, string[]> = {
  運動: ["sport1", "sport2"],
  心情: ["mood1", "mood2"],
  人際: ["love1", "love2"],
  飲食: ["eat1", "eat2"],
  娛樂: ["entertainment1", "entertainment2"],
  "學業/工作": ["mood1", "mood2"],
  寵物: ["pet1", "pet2"],
  金錢: ["sport1", "sport2"],
  自我成長: ["love1", "love2"],
  其他: ["eat1", "eat2"],
};

const getRandomIndex = (length: number): number => {
  if (length <= 0) return -1;

  const cryptoSource = globalThis.crypto as
    | {
        getRandomValues?: (array: Uint32Array) => Uint32Array;
      }
    | undefined;

  if (cryptoSource?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoSource.getRandomValues(values);
    return values[0] % length;
  }

  return Math.floor(Math.random() * length);
};

export const getRandomVariantForTag = (tag: string): string | null => {
  const variants = TAG_TO_VARIANTS[tag];
  if (!variants || variants.length === 0) return null;
  return variants[getRandomIndex(variants.length)];
};

export const getAssetForPlant = (plant: any) => {
  if (!plant || !plant.type) return null;
  const arr = ASSET_MAP[plant.type];
  if (!arr) return null;
  const idx = Math.abs(plant.imageIndex || -1) - 1; // 0-based
  if (idx < 0 || idx >= arr.length) return null;
  return arr[idx];
};

export const getFallbackEmoji = (plant: any) => {
  if (!plant) return "🌱";
  if ((plant.repliesCount || 0) === 0) return "🌱";
  if ((plant.repliesCount || 0) < 5) return "🌿";
  return "🌸";
};
