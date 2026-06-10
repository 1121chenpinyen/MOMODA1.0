import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "../config/firebaseConfig";
import petsData from "../data/pets.json";
import plantsData from "../data/plants.json";

import { Dimensions } from "react-native";

const gardenChangeListeners = new Set();

const emitGardenChange = () => {
  for (const listener of gardenChangeListeners) {
    try {
      listener();
    } catch (error) {
      console.error("通知花園更新失敗:", error);
    }
  }
};

const getGardenWidth = () => Dimensions.get("window").width;
const getGardenHeight = () => Dimensions.get("window").height;

const getUnlockedZoneCount = (plantCount) => {
  if (plantCount >= 100) return 3;
  if (plantCount >= 50) return 2;
  return 1;
};

const getAllowedZoneIndexes = (zoneCount) => {
  if (zoneCount === 1) return [1];
  if (zoneCount === 2) return [1, 0];
  return [1, 0, 2];
};

const getZoneIndexForPosition = (position) => {
  if (!position || typeof position.x !== "number") return 1;
  const zoneWidth = getGardenWidth();
  return Math.max(0, Math.min(2, Math.floor(position.x / zoneWidth)));
};

const buildPlantPosition = (zoneIndex, slotIndex) => {
  const zoneWidth = getGardenWidth();
  const zoneHeight = getGardenHeight();
  const zoneStartX = zoneIndex * zoneWidth;
  const maxRows = Math.max(3, Math.floor((zoneHeight - 280) / 140));
  const col = Math.floor(slotIndex / maxRows) % 2;
  const row = slotIndex % maxRows;

  return {
    x: zoneStartX + col * 180 + 40,
    y: row * 140 + 180,
  };
};

// 限制生成位置，避免跑出畫面（預設上限 450）
const clampGeneratedPosition = (pos, maxX = 450, maxY = 450) => {
  if (!pos) return { x: 40, y: 180 };
  return {
    x: Math.max(0, Math.min(maxX, Math.round(pos.x))),
    y: Math.max(0, Math.min(maxY, Math.round(pos.y))),
  };
};

// 生成在目前可見中區的安全位置，避免新植物一出生就落到畫面外
const getVisibleSpawnPosition = (zoneIndex = 1, slotIndex = 0) => {
  const zoneWidth = getGardenWidth();
  const zoneHeight = getGardenHeight();
  const zoneStartX = zoneIndex * zoneWidth;

  const xOffsets = [40, 220];
  const yOffsets = [160, 300];

  const x = zoneStartX + xOffsets[slotIndex % xOffsets.length];
  const y = yOffsets[Math.floor(slotIndex / xOffsets.length) % yOffsets.length];

  return {
    x: Math.min(zoneStartX + zoneWidth - 160, x),
    y: Math.min(zoneHeight - 160, y),
  };
};

const pickPlantZone = (garden) => {
  const zoneCount = getUnlockedZoneCount((garden.plants || []).length);
  const allowedZones = getAllowedZoneIndexes(zoneCount);
  const positions = garden.positions || {};

  const zoneLoad = allowedZones.map((zoneIndex) => ({
    zoneIndex,
    count: (garden.plants || []).filter((plant) => {
      const position = positions[plant.id];
      return getZoneIndexForPosition(position) === zoneIndex;
    }).length,
  }));

  zoneLoad.sort((a, b) => a.count - b.count);
  return zoneLoad[0]?.zoneIndex ?? 1;
};
export const subscribeGardenChanges = (listener) => {
  gardenChangeListeners.add(listener);

  return () => {
    gardenChangeListeners.delete(listener);
  };
};

// 初始化全局數據（食物計數、玩具列表、金錢、水滴、施肥）
export const initGlobalData = async () => {
  const stored = await AsyncStorage.getItem("globalData");
  if (!stored) {
    const globalData = {
      catFoodCount: 5,
      dogFoodCount: 5,
      toys: [],
      money: 50,
      waterDrops: 0,
      fertilizers: 0,
    };
    await AsyncStorage.setItem("globalData", JSON.stringify(globalData));
  }
};

// 取得全局數據
export const getGlobalData = async () => {
  await initGlobalData();
  const stored = await AsyncStorage.getItem("globalData");
  const defaultData = {
    catFoodCount: 5,
    dogFoodCount: 5,
    toys: [],
    money: 50,
    waterDrops: 0,
    fertilizers: 0,
  };
  if (!stored) return defaultData;

  const parsed = JSON.parse(stored);
  // 確保新字段存在
  return {
    ...defaultData,
    ...parsed,
  };
};

// 更新全局數據
export const updateGlobalData = async (newData) => {
  const globalData = await getGlobalData();
  const updated = { ...globalData, ...newData };
  if (typeof updated.waterDrops === "number") {
    updated.waterDrops = Math.max(0, Math.min(30, updated.waterDrops));
  }
  if (typeof updated.fertilizers === "number") {
    updated.fertilizers = Math.max(0, Math.min(30, updated.fertilizers));
  }
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
      layoutVersion: 2,
      // 已解鎖的區域數（持久化）：預設為 1，除非使用者點選清除全部時會重置
      unlockedZones: 1,
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
    // 保留 unlockedZones（若 caller 明確傳入則使用新值，否則保留舊值）
    unlockedZones:
      newData.unlockedZones !== undefined
        ? newData.unlockedZones
        : garden.unlockedZones || 1,
  };
  // 標記最後修改時間，便於前端檢查變更
  try {
    updated.lastModified = new Date().toISOString();
  } catch (e) {
    // ignore
  }
  await AsyncStorage.setItem("garden", JSON.stringify(updated));
  emitGardenChange();
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
    eat1: "番茄",
    eat2: "草莓",
    mood1: "黃色雛菊",
    mood2: "薰衣草",
    love1: "鬱金香",
    love2: "康乃馨",
    sport1: "向日葵",
    sport2: "仙人掌",
    entertainment1: "七彩花",
    entertainment2: "水仙花",
    pet1: "白色雛菊",
    pet2: "四頁草",
  };

  let name = typeNameMap[seedType] || seedType;
  let rarity = "common";

  const now = new Date();
  const lifeExpireAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 發文生成的植物生命為 3 天

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
    lifeExpireAt: lifeExpireAt.toISOString(),
  };

  garden.plants.push(newPlant);

  // 檢查是否應該提升已解鎖的區域數（解鎖是永久的，直到 clearAllPlants 被呼叫）
  try {
    const plantCount = (garden.plants || []).length;
    const desiredZones = plantCount >= 40 ? 3 : plantCount >= 20 ? 2 : 1;
    garden.unlockedZones = Math.max(garden.unlockedZones || 1, desiredZones);
  } catch (e) {
    // ignore
  }

  // 為新植物分配初始位置
  const positions = garden.positions || {};
  // 發文生成的植物要先出現在預設可見區，避免新增了但畫面停在其他區看不到
  const chosenZone = 1;
  const zoneSlotIndex = (garden.plants || []).filter((plant) => {
    const position = positions[plant.id];
    return getZoneIndexForPosition(position) === chosenZone;
  }).length;
  positions[newPlant.id] = getVisibleSpawnPosition(chosenZone, zoneSlotIndex);

  // 確保明確更新 plants 與 positions，並記錄用於偵錯
  console.log(
    "createPlantForPost: creating plant",
    newPlant.id,
    "zone",
    chosenZone,
    "pos",
    positions[newPlant.id],
  );
  await updateGarden({
    plants: garden.plants,
    positions,
    unlockedZones: garden.unlockedZones,
    lastSpawnedPlantId: newPlant.id,
    lastSpawnedPosition: positions[newPlant.id],
  });
  console.log("createPlantForPost: updateGarden called for plant", newPlant.id);

  // 立即讀取並 log garden，協助確認 AsyncStorage 已被寫入
  try {
    const after = await getGarden();
    console.log(
      "createPlantForPost: garden after update, plants:",
      (after.plants || []).length,
      "lastModified:",
      after.lastModified,
    );
  } catch (e) {
    console.error("createPlantForPost: failed to read garden after update", e);
  }

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
    imageIndex: -1,
    locked: false,
    createdAt: new Date().toISOString(),
    postId: postId || null, // 關聯的貼文 ID
    lifeExpireAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 植物生命為 3 天
  };

  garden.plants.push(newPlant);

  // 檢查是否應該提升已解鎖的區域數（解鎖是永久的，直到 clearAllPlants 被呼叫）
  try {
    const plantCount = (garden.plants || []).length;
    const desiredZones = plantCount >= 40 ? 3 : plantCount >= 20 ? 2 : 1;
    garden.unlockedZones = Math.max(garden.unlockedZones || 1, desiredZones);
  } catch (e) {
    // ignore
  }

  const positions = garden.positions || {};
  const chosenZone = pickPlantZone(garden);
  const zoneSlotIndex = (garden.plants || []).filter((plant) => {
    const position = positions[plant.id];
    return getZoneIndexForPosition(position) === chosenZone;
  }).length;
  positions[newPlant.id] = getVisibleSpawnPosition(chosenZone, zoneSlotIndex);

  console.log(
    "plantSeed: planting",
    newPlant.id,
    "zone",
    chosenZone,
    "pos",
    positions[newPlant.id],
  );
  await updateGarden({
    plants: garden.plants,
    positions,
    unlockedZones: garden.unlockedZones,
    lastSpawnedPlantId: newPlant.id,
    lastSpawnedPosition: positions[newPlant.id],
  });
  console.log("plantSeed: updateGarden called for plant", newPlant.id);

  try {
    const after = await getGarden();
    console.log(
      "plantSeed: garden after update, plants:",
      (after.plants || []).length,
      "lastModified:",
      after.lastModified,
    );
  } catch (e) {
    console.error("plantSeed: failed to read garden after update", e);
  }

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

  // 若舊資料沒有 imageIndex，先補成 -1，確保後續成長會反映到外觀
  const currentImageIndex =
    typeof plant.imageIndex === "number" ? plant.imageIndex : -1;
  // 每收到一個回覆就 -1（例如 -1 -> -2），最小到 -6
  plant.imageIndex = Math.max(-6, currentImageIndex - increment);

  // 同時保持舊的 growth 字段（每 5 回覆為一階段）
  plant.growth = Math.min(5, Math.floor(plant.repliesCount / 5));

  await updateGarden(garden);
  return plant;
};

// 計算植物剩餘生命（小時）
export const getPlantRemainingLife = (plant) => {
  if (!plant.lifeExpireAt) return Infinity; // 舊植物沒有倒數
  const now = new Date().getTime();
  const expireTime = new Date(plant.lifeExpireAt).getTime();
  const remaining = Math.max(0, (expireTime - now) / (1000 * 60 * 60)); // 轉換為小時
  return remaining;
};

// 檢查植物是否枯萎
export const isPlantDead = (plant) => {
  return getPlantRemainingLife(plant) <= 0;
};

// 將已枯萎但尚未標記的植物補上枯萎時間，並保留在花園中
export const markWiltedPlants = async (gardenInput = null) => {
  const garden = gardenInput || (await getGarden());
  const plants = garden.plants || [];
  const wiltedAt = new Date().toISOString();

  let changed = false;
  const updatedPlants = plants.map((plant) => {
    if (isPlantDead(plant) && !plant.wiltedAt) {
      changed = true;
      return {
        ...plant,
        wiltedAt,
      };
    }
    return plant;
  });

  if (!changed) {
    return garden;
  }

  const updatedGarden = {
    ...garden,
    plants: updatedPlants,
  };

  await updateGarden(updatedGarden);
  return updatedGarden;
};

// 移除已成熟的植物（可選，用於清理花園）
export const removePlant = async (plantId) => {
  const garden = await getGarden();
  garden.plants = garden.plants.filter((p) => p.id !== plantId);
  if (garden.positions) {
    delete garden.positions[plantId];
  }
  await updateGarden(garden);
};

// 清除花園中所有植物（保留 seeds）
export const clearAllPlants = async () => {
  const garden = await getGarden();
  garden.plants = [];
  garden.positions = {};
  // 清除時重置解鎖區域
  garden.unlockedZones = 1;
  await updateGarden(garden);
  return garden;
};

// 領取 Firebase 中待處理的施肥
export const claimPendingFertilizers = async (userId) => {
  if (!userId) return 0;

  try {
    const profileRef = doc(db, "profiles", userId);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      const pendingFertilizers = profileSnap.data().pendingFertilizers || 0;

      if (pendingFertilizers > 0) {
        // 領取施肥並重置
        const globalData = await getGlobalData();
        const newFertilizers = Math.min(
          30,
          (globalData.fertilizers || 0) + pendingFertilizers,
        );
        await updateGlobalData({ fertilizers: newFertilizers });

        // 在 Firebase 中重置待處理施肥
        try {
          await updateDoc(profileRef, { pendingFertilizers: 0 });
        } catch (e) {
          console.error("無法在 Firebase 中重置 pendingFertilizers:", e);
        }
        return pendingFertilizers;
      }
    }
  } catch (e) {
    console.error("領取施肥失敗:", e);
  }

  return 0;
};

// 領取雲端貼文上累積的待成長次數，套用到作者本機花園
export const claimPendingPlantGrowth = async (userId) => {
  if (!userId) return 0;

  try {
    const postsSnap = await getDocs(collection(db, "posts"));
    const garden = await getGarden();
    let claimedGrowth = 0;

    for (const postSnap of postsSnap.docs) {
      const postData = postSnap.data();
      // Accept either authorId or deviceId for compatibility
      const postOwnerId = postData.authorId || postData.deviceId || null;
      // Log for debugging: show owner and pendingGrowth
      console.log(
        "claimPendingPlantGrowth: checking post",
        postSnap.id,
        "owner=",
        postOwnerId,
        "userId=",
        userId,
      );

      if (postOwnerId !== userId) continue;

      const pendingGrowth = postData.pendingGrowth || 0;
      if (pendingGrowth <= 0) continue;

      const relatedPlants = (garden.plants || []).filter(
        (plant) => plant.postId === postSnap.id,
      );

      console.log(
        "claimPendingPlantGrowth: post",
        postSnap.id,
        "pendingGrowth=",
        pendingGrowth,
        "relatedPlants=",
        relatedPlants.map((p) => p.id),
      );

      if (relatedPlants.length > 0) {
        for (const plant of relatedPlants) {
          await growPlant(plant.id, pendingGrowth);
          claimedGrowth += pendingGrowth;
        }
      }

      await updateDoc(doc(db, "posts", postSnap.id), {
        pendingGrowth: 0,
      });
    }

    return claimedGrowth;
  } catch (e) {
    console.error("領取待成長失敗:", e);
    return 0;
  }
};

// 領取貼文留言按讚產生的施肥獎勵
export const claimCommentLikeFertilizers = async (userId) => {
  if (!userId) return 0;

  try {
    const postsSnap = await getDocs(collection(db, "posts"));
    let claimedCount = 0;

    for (const postSnap of postsSnap.docs) {
      const postData = postSnap.data();
      const comments = Array.isArray(postData.comments)
        ? postData.comments
        : [];
      let hasChanges = false;

      const updatedComments = comments.map((comment) => {
        if (comment?.userId !== userId) return comment;

        if (comment.fertilizerRewardClaimed) {
          return comment;
        }

        const rewards = Array.isArray(comment.fertilizerRewards)
          ? comment.fertilizerRewards
          : [];

        const rewardIndex = rewards.findIndex((reward) => {
          const claimedBy = Array.isArray(reward.claimedBy)
            ? reward.claimedBy
            : [];
          return !claimedBy.includes(userId);
        });

        if (rewardIndex === -1) return comment;

        const updatedRewards = rewards.map((reward, index) => {
          if (index !== rewardIndex) return reward;

          const claimedBy = Array.isArray(reward.claimedBy)
            ? reward.claimedBy
            : [];

          return {
            ...reward,
            claimedBy: [...claimedBy, userId],
            claimedAt: new Date().toISOString(),
          };
        });

        claimedCount += 1;

        hasChanges = true;
        return {
          ...comment,
          fertilizerRewardClaimed: true,
          fertilizerRewards: updatedRewards,
        };
      });

      if (hasChanges) {
        await updateDoc(doc(db, "posts", postSnap.id), {
          comments: updatedComments,
        });
      }
    }

    if (claimedCount > 0) {
      const globalData = await getGlobalData();
      const newFertilizers = Math.min(
        30,
        (globalData.fertilizers || 0) + claimedCount,
      );
      await updateGlobalData({ fertilizers: newFertilizers });
    }

    return claimedCount;
  } catch (e) {
    console.error("領取留言按讚施肥失敗:", e);
    return 0;
  }
};

// 嘗試領取所有待處理獎勵，回傳實際新領取的數量。
// 不再使用本地旗標；後端的 claimed 標記應該保證 idempotency。
export const claimPendingRewardsOnce = async (userId) => {
  if (!userId) return 0;

  try {
    const claimedF = await claimPendingFertilizers(userId);
    const claimedCF = await claimCommentLikeFertilizers(userId);
    const claimedG = await claimPendingPlantGrowth(userId);

    const total = (claimedF || 0) + (claimedCF || 0) + (claimedG || 0);
    return total;
  } catch (e) {
    console.error("claimPendingRewardsOnce 失敗:", e);
    return 0;
  }
};
