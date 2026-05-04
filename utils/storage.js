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
  const updated = { ...garden, ...newData };
  await AsyncStorage.setItem("garden", JSON.stringify(updated));
};

// 添加種子（發布貼文時調用）
export const addSeeds = async (count = 1) => {
  const garden = await getGarden();
  garden.seeds += count;
  await updateGarden(garden);
};

// 種植種子（生成新植物）
export const plantSeed = async (seedType) => {
  const garden = await getGarden();

  if (garden.seeds < 1) {
    throw new Error("沒有足夠的種子");
  }

  const seedTemplate = plantsData.find((p) => p.type === seedType);
  if (!seedTemplate) {
    throw new Error("種子類型不存在");
  }

  garden.seeds -= 1;

  const newPlant = {
    id: `plant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: seedType,
    name: seedTemplate.name,
    rarity: seedTemplate.rarity,
    growth: 0, // 成長階段 0-5
    repliesCount: 0, // 收到的回覆數
    createdAt: new Date().toISOString(),
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

  // 每 5 個回覆成長一階段
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
