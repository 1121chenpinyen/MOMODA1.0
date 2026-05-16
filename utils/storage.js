import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebaseConfig";
import petsData from "../data/pets.json";
import plantsData from "../data/plants.json";

// 初始化全局數據（食物計數、玩具列表、金錢）
export const initGlobalData = async () => {
  const stored = await AsyncStorage.getItem("globalData");
  if (!stored) {
    const globalData = {
      catFoodCount: 5,
      dogFoodCount: 5,
      toys: [],
      money: 50,
    };
    await AsyncStorage.setItem("globalData", JSON.stringify(globalData));
  }
};

// 取得全局數據
export const getGlobalData = async () => {
  await initGlobalData();
  const stored = await AsyncStorage.getItem("globalData");
  return stored
    ? JSON.parse(stored)
    : { catFoodCount: 5, dogFoodCount: 5, toys: [], money: 50 };
};

// 更新全局數據
export const updateGlobalData = async (newData) => {
  const globalData = await getGlobalData();
  const updated = { ...globalData, ...newData };
  await AsyncStorage.setItem("globalData", JSON.stringify(updated));
};

// 初始化（第一次開 app）
export const initPets = async () => {
  const stored = await AsyncStorage.getItem("pets");
  if (!stored) {
    const initializedPets = petsData.map((pet) => ({
      ...pet,
      level: pet.level || 1,
      rewards: pet.rewards || 0,
    }));
    await AsyncStorage.setItem("pets", JSON.stringify(initializedPets));
  }
  await initGlobalData();
};

// 取得全部寵物
export const getPets = async () => {
  const stored = await AsyncStorage.getItem("pets");
  return stored ? JSON.parse(stored) : [];
};

// 更新單一寵物
export const updatePet = async (petId, newData) => {
  const pets = await getPets();
  const index = pets.findIndex((p) => p.id === petId);

  if (index !== -1) {
    pets[index] = { ...pets[index], ...newData };
    await AsyncStorage.setItem("pets", JSON.stringify(pets));
  }
};
// 💡 核心：將 Firebase 的錢同步到本地 AsyncStorage
export const syncMoneyFromFirebase = async (deviceId) => {
  if (!deviceId) return;
  try {
    const profileRef = doc(db, "profiles", deviceId);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      const firebaseMoney = profileSnap.data().money || 0;
      // 同步到本地 AsyncStorage
      await updateGlobalData({ money: firebaseMoney });
      return firebaseMoney;
    }
  } catch (e) {
    console.error("同步 Firebase 金錢失敗:", e);
  }
};
// 重置所有數據（用於測試）
export const resetAllData = async () => {
  await AsyncStorage.clear();
  await initPets();
  await initGlobalData();
};

// ==================== 花園系統相關函數 ====================

// 初始化花園數據
export const initGarden = async () => {
  const stored = await AsyncStorage.getItem("garden");
  if (!stored) {
    const garden = {
      seeds: 0, // 種子數量
      plants: [], // 已種植的植物
    };
    await AsyncStorage.setItem("garden", JSON.stringify(garden));
  }
};

// 取得花園數據
export const getGarden = async () => {
  await initGarden();
  const stored = await AsyncStorage.getItem("garden");
  return stored ? JSON.parse(stored) : { seeds: 0, plants: [] };
};

// 更新花園數據
export const updateGarden = async (newData) => {
  const garden = await getGarden();
  const updated = {
    ...garden,
    ...newData,
    // 確保 plants 和 positions 被正確合併
    plants: newData.plants !== undefined ? newData.plants : garden.plants,
    positions:
      newData.positions !== undefined
        ? newData.positions
        : garden.positions || {},
  };
  await AsyncStorage.setItem("garden", JSON.stringify(updated));
};

// 添加種子（發布貼文時調用）
export const addSeeds = async (count = 1) => {
  const garden = await getGarden();
  garden.seeds += count;
  await updateGarden(garden);
};

// 發文後直接生成對應植物，不消耗種子
export const createPlantForPost = async (seedType, postId) => {
  const garden = await getGarden();

  // 為各個植物類型映射合適的名稱
  const typeNameMap = {
    eat1: "進食植物 1",
    eat2: "進食植物 2",
    mood1: "心情植物 1",
    mood2: "心情植物 2",
    love1: "人際植物 1",
    love2: "人際植物 2",
    sport1: "運動植物 1",
    sport2: "運動植物 2",
    entertainment1: "娛樂植物 1",
    entertainment2: "娛樂植物 2",
  };

  let name = typeNameMap[seedType] || seedType;
  let rarity = "common";

  const newPlant = {
    id: `plant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: seedType,
    name,
    rarity,
    growth: 0,
    repliesCount: 0,
    imageIndex: -1,
    locked: false,
    createdAt: new Date().toISOString(),
    postId: postId || null,
  };

  garden.plants.push(newPlant);

  // 為新植物分配初始位置
  const positions = garden.positions || {};
  const plantCount = garden.plants.length;
  positions[newPlant.id] = {
    x: ((plantCount - 1) % 2) * 180 + 40,
    y: Math.floor((plantCount - 1) / 2) * 120 + 200,
  };

  await updateGarden({ ...garden, positions });

  return newPlant;
};

// 種植種子（生成新植物）
export const plantSeed = async (seedType, postId) => {
  const garden = await getGarden();

  if (garden.seeds < 1) {
    throw new Error("沒有足夠的種子");
  }

  const seedTemplate = plantsData.find((p) => p.type === seedType);
  garden.seeds -= 1;
  let name = seedType;
  let rarity = "common";
  if (seedTemplate) {
    name = seedTemplate.name;
    rarity = seedTemplate.rarity || rarity;
  }

  const newPlant = {
    id: `plant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: seedType,
    name,
    rarity,
    growth: 0, // 成長階段 0-5
    repliesCount: 0, // 收到的回覆數
    locked: false,
    createdAt: new Date().toISOString(),
    postId: postId || null, // 關聯的貼文 ID
  };

  garden.plants.push(newPlant);
  await updateGarden(garden);

  return newPlant;
};

// 增加植物的成長（每個回覆加 1）
export const growPlant = async (plantId, increment = 1) => {
  const garden = await getGarden();
  const plant = garden.plants.find((p) => p.id === plantId);

  if (!plant) {
    throw new Error("植物不存在");
  }

  plant.repliesCount += increment;

  // 若使用 imageIndex（負數），每收到一個回覆就 -1（例如 -1 -> -2），最小到 -5
  if (typeof plant.imageIndex === "number") {
    plant.imageIndex = Math.max(-5, (plant.imageIndex || -1) - increment);
  }

  // 同時保持舊的 growth 字段（每 5 回覆為一階段）
  plant.growth = Math.min(5, Math.floor(plant.repliesCount / 5));

  await updateGarden(garden);
  return plant;
};

// 移除已成熟的植物（可選，用於清理花園）
export const removePlant = async (plantId) => {
  const garden = await getGarden();
  garden.plants = garden.plants.filter((p) => p.id !== plantId);
  await updateGarden(garden);
};

// 清除花園中所有植物（保留 seeds）
export const clearAllPlants = async () => {
  const garden = await getGarden();
  garden.plants = [];
  await updateGarden(garden);
  return garden;
};
