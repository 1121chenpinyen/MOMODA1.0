import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageBackground,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import FlowerCard from "../../components/FlowerCard";
import { db } from "../../config/firebaseConfig";
import {
  DEFAULT_PLANT_IMAGE_OFFSETS,
  DEFAULT_PLANT_IMAGE_SIZES,
  DEFAULT_PLANT_IMAGE_XOFFSETS,
} from "../../constants/plantImageSizes";
import { getDeviceId } from "../../utils/getDeviceId";
import { getFallbackEmoji } from "../../utils/plantCatalog";
import {
  claimPendingRewardsOnce,
  clearAllPlants,
  getGarden,
  getGlobalData,
  getPlantRemainingLife,
  initGarden,
  isPlantDead,
  removePlant,
  subscribeGardenChanges,
  updateGarden,
  updateGlobalData,
} from "../../utils/storage";

const backgroundImage = require("../../assets/background/background.png");
const backgroundAsset = Image.resolveAssetSource(backgroundImage);
const BACKGROUND_ASPECT_RATIO =
  backgroundAsset.width && backgroundAsset.height
    ? backgroundAsset.width / backgroundAsset.height
    : 1;

const { width, height } = Dimensions.get("window");
const PLANT_SIZE = 10;
const WORLD_WIDTH = width * 3;
const BACKGROUND_HEIGHT = WORLD_WIDTH / BACKGROUND_ASPECT_RATIO;
const MAX_CAMERA_SCALE = 2.2;
// 當聚焦時，畫面中心的垂直偏移量（正值會把植物往上移動至視窗中心上方）
const FOCUS_SCREEN_OFFSET_Y = 80;

const getUnlockedZoneCount = (plantCount: number) => {
  if (plantCount >= 40) return 3;
  if (plantCount >= 20) return 2;
  return 1;
};

const getCameraBounds = (plantCount: number) => {
  const zoneCount = getUnlockedZoneCount(plantCount);

  if (zoneCount === 1) {
    return { min: -width, max: -width };
  }

  if (zoneCount === 2) {
    return { min: -width, max: 0 };
  }

  return { min: -width * 2, max: 0 };
};

const getUnlockedZoneSpan = (plantCount: number) => {
  const zoneCount = getUnlockedZoneCount(plantCount);

  if (zoneCount === 1) {
    return { start: width, end: width * 2 };
  }

  if (zoneCount === 2) {
    return { start: 0, end: width * 2 };
  }

  return { start: 0, end: WORLD_WIDTH };
};

const getPlantXBounds = (plantCount: number) => {
  const zoneCount = getUnlockedZoneCount(plantCount);

  if (zoneCount === 1) {
    return { min: width, max: width * 2 - PLANT_SIZE };
  }

  if (zoneCount === 2) {
    return { min: 0, max: width * 2 - PLANT_SIZE };
  }

  return { min: 0, max: WORLD_WIDTH - PLANT_SIZE };
};

const getDefaultWorldPosition = (
  index: number,
  totalPlants: number,
  zoneCount: number,
) => {
  const zoneOrder =
    zoneCount === 1 ? [1] : zoneCount === 2 ? [1, 0] : [1, 0, 2];
  const zoneIndex = zoneOrder[index % zoneOrder.length];
  const zonePlantRow = Math.floor(index / zoneOrder.length);

  return {
    x: zoneIndex * width + ((zonePlantRow % 2) * 180 + 40),
    y: Math.floor(zonePlantRow / 2) * 160 + 260,
  };
};

export default function GardenScreen() {
  const [garden, setGarden] = useState<{ seeds: number; plants: any[] } | null>(
    null,
  );
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const [plantFocusVisible, setPlantFocusVisible] = useState<boolean>(false);
  const [focusedPost, setFocusedPost] = useState<any | null>(null);
  const [loadingPost, setLoadingPost] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [gardenAreaLayout, setGardenAreaLayout] = useState({
    width,
    height,
  });
  const [waterDrops, setWaterDrops] = useState<number>(0);
  const [fertilizers, setFertilizers] = useState<number>(0);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const zoomTranslateX = useRef(new Animated.Value(0)).current;
  const zoomTranslateY = useRef(new Animated.Value(0)).current;
  const zoomScale = useRef(new Animated.Value(1)).current;
  const focusCardOpacity = useRef(new Animated.Value(0)).current;
  const focusCardScale = useRef(new Animated.Value(0.96)).current;
  const scenePanX = useRef(new Animated.Value(-width)).current;
  const scenePanY = useRef(new Animated.Value(0)).current;
  const cameraScale = useRef(new Animated.Value(1)).current;
  const scenePanXRef = useRef(-width);
  const scenePanYRef = useRef(0);
  const scenePanStartXRef = useRef(-width);
  const scenePanStartYRef = useRef(0);
  const cameraScaleRef = useRef(1);
  const preFocusCameraRef = useRef<{
    x: number;
    y: number;
    scale: number;
  } | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const focusZoomScaleRef = useRef(1);
  const zoomTranslateXRef = useRef(0);
  const zoomTranslateYRef = useRef(0);
  const plantTouchRefs = useRef<Record<string, any>>({});
  const sceneViewportRef = useRef<any>(null);
  const panAnimationCancelRef = useRef(false);

  const [plantPositions, setPlantPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [draftPlantPositions, setDraftPlantPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const draftPlantPositionsRef = useRef<
    Record<string, { x: number; y: number }>
  >({});
  const plantPositionsRef = useRef<Record<string, { x: number; y: number }>>(
    {},
  );
  const plantAnimatedPositionsRef = useRef<Record<string, Animated.ValueXY>>(
    {},
  );
  const [lockedPlants, setLockedPlants] = useState<Set<string>>(new Set());
  const isDraggingPlantRef = useRef(false);
  const activePlantDragIdRef = useRef<string | null>(null);
  const dragStartPos = useRef<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });
  const draftPlantRafRef = useRef<number | null>(null);
  const pendingDragResetPlantIdRef = useRef<string | null>(null);
  const [dragResetToken, setDragResetToken] = useState(0);
  const mountedRef = useRef(true);
  const hasInitializedCameraRef = useRef(false);
  const hasUnlockedPlantsRef = useRef(false);

  const sceneContentHeight = Math.max(
    BACKGROUND_HEIGHT,
    gardenAreaLayout.height,
  );

  const getMinCameraScale = useCallback(() => {
    const viewportHeight = Math.max(1, gardenAreaLayout.height);
    return Math.min(1, viewportHeight / Math.max(sceneContentHeight, 1));
  }, [gardenAreaLayout.height, sceneContentHeight]);

  const clampCamera = useCallback(
    (
      x: number,
      y: number,
      scale: number,
      plantCount: number,
      allowOverflow = false,
    ) => {
      const viewportWidth = Math.max(1, gardenAreaLayout.width);
      const viewportHeight = Math.max(1, gardenAreaLayout.height);
      const worldWidthScaled = WORLD_WIDTH * scale;
      const worldHeightScaled = sceneContentHeight * scale;

      // Allow camera to move slightly beyond the background bounds so
      // selected plants can be centered even near edges.
      const OVERFLOW_MARGIN_X = allowOverflow ? viewportWidth : 0; // allow one viewport when requested
      const OVERFLOW_MARGIN_Y = allowOverflow ? viewportHeight : 0;

      const worldMinX = viewportWidth - worldWidthScaled - OVERFLOW_MARGIN_X;
      const worldMaxX = 0 + OVERFLOW_MARGIN_X;
      const worldMinY = viewportHeight - worldHeightScaled - OVERFLOW_MARGIN_Y;
      const worldMaxY = 0 + OVERFLOW_MARGIN_Y;

      // Previously we limited camera to unlocked zones. That prevented
      // panning into locked (right-side) regions. Allow full-world panning
      // (subject to overflow margins) so user can center plants near edges.
      const minX = worldMinX;
      const maxX = worldMaxX;
      const clampedX =
        minX <= maxX
          ? Math.max(minX, Math.min(x, maxX))
          : Math.max(worldMinX, Math.min(x, worldMaxX));
      const clampedY =
        worldMinY <= worldMaxY
          ? Math.max(worldMinY, Math.min(y, worldMaxY))
          : 0;

      return {
        x: clampedX,
        y: clampedY,
      };
    },
    [gardenAreaLayout.height, gardenAreaLayout.width, sceneContentHeight],
  );

  const applyCamera = useCallback(
    (
      x: number,
      y: number,
      scale: number,
      plantCount: number,
      allowOverflow = false,
    ) => {
      const minScale = getMinCameraScale();
      const nextScale = Math.max(minScale, Math.min(scale, MAX_CAMERA_SCALE));
      const clamped = clampCamera(x, y, nextScale, plantCount, allowOverflow);

      scenePanXRef.current = clamped.x;
      scenePanYRef.current = clamped.y;
      cameraScaleRef.current = nextScale;

      scenePanX.setValue(clamped.x);
      scenePanY.setValue(clamped.y);
      cameraScale.setValue(nextScale);
    },
    [cameraScale, clampCamera, getMinCameraScale, scenePanX, scenePanY],
  );

  useEffect(() => {
    const plants = garden?.plants || [];
    hasUnlockedPlantsRef.current = plants.some(
      (plant: any) => !lockedPlants.has(plant.id),
    );
  }, [garden?.plants, lockedPlants]);

  const getAnimatedPlantPosition = (plantId: string) => {
    if (!plantAnimatedPositionsRef.current[plantId]) {
      plantAnimatedPositionsRef.current[plantId] = new Animated.ValueXY({
        x: 0,
        y: 0,
      });
    }

    return plantAnimatedPositionsRef.current[plantId];
  };

  useEffect(() => {
    const zoomScaleListener = zoomScale.addListener(({ value }) => {
      focusZoomScaleRef.current = value;
    });
    const zoomXListener = zoomTranslateX.addListener(({ value }) => {
      zoomTranslateXRef.current = value;
    });
    const zoomYListener = zoomTranslateY.addListener(({ value }) => {
      zoomTranslateYRef.current = value;
    });

    return () => {
      zoomScale.removeListener(zoomScaleListener);
      zoomTranslateX.removeListener(zoomXListener);
      zoomTranslateY.removeListener(zoomYListener);
    };
  }, [zoomScale, zoomTranslateX, zoomTranslateY]);

  // 設定不同成長階段的觸碰區高度
  // 需求：每收到 1 次回覆就升 1 階（最多 5 階），且只在 Y 軸變大
  const TOUCH_BASE_BOTTOM_OFFSET = 10; // distance from bottom of plant container to bottom edge of touch area
  const TOUCH_FIXED_WIDTH = 25;
  const STAGE_TOUCH_HEIGHTS = [30, 30, 40, 50, 75, 100];
  const getLockedTouchStyle = (plant: any) => {
    const replies =
      typeof plant?.repliesCount === "number" ? plant.repliesCount : 0;
    const imageIndex =
      typeof plant?.imageIndex === "number" ? plant.imageIndex : -1;
    const plantType = typeof plant?.type === "string" ? plant.type : "";
    const isSeedStage = imageIndex === -1;
    const visualStage = Math.max(
      0,
      Math.min(5, Math.abs(imageIndex || -1) - 1),
    );
    const isEat2FinalFlower = plantType === "eat2" && imageIndex <= -6;

    // 每收到 1 則回覆，觸碰區升 1 階；施肥一次成長兩格，所以視覺階段直接跳兩階
    const stageCount = STAGE_TOUCH_HEIGHTS.length - 1;
    const replyStage = Math.max(0, Math.min(stageCount, replies));
    const stage = Math.max(replyStage, visualStage);
    const seedTouchSize = 35;
    const width = isSeedStage
      ? seedTouchSize
      : isEat2FinalFlower
        ? TOUCH_FIXED_WIDTH + 65
        : TOUCH_FIXED_WIDTH + 10;
    const height = isSeedStage
      ? seedTouchSize
      : STAGE_TOUCH_HEIGHTS[stage] + 10;
    const left = (PLANT_SIZE - width) / 2;
    const dragTouchLift = 13;
    const top = isSeedStage
      ? PLANT_SIZE - height + 25 - dragTouchLift
      : PLANT_SIZE - TOUCH_BASE_BOTTOM_OFFSET - height - 10 - dragTouchLift;
    const out = {
      width,
      height,
      left,
      top,
    };

    // 預設每階段的 top 偏移（單位 px）
    // 發芽(1): -10, 幼苗(2): -5, 小草(3): +3, 小花(4): +8, 花(5): +20
    const STAGE_DEFAULT_TOP_OFFSETS: Record<number, number> = {
      1: -10,
      2: -3,
      3: 5,
      4: 15,
      5: 28,
    };

    // 支援 per-plant 覆寫：
    // plant.touchOverride: { left?, top?, width?, height? }
    // plant.touchStageOverrides: { [stageNumber]: { left?, top?, width?, height? } }
    try {
      const globalOverride = plant?.touchOverride || null;
      const stageOverride = (plant?.touchStageOverrides || {})[stage] || null;
      const merged = {
        ...out,
        ...(globalOverride || {}),
        ...(stageOverride || {}),
      };

      // 套用階段預設 top 偏移（若該階段有設定）
      const stageOffset = STAGE_DEFAULT_TOP_OFFSETS[stage] || 0;
      if (typeof merged.top === "number") {
        merged.top = merged.top + stageOffset;
      }

      return merged;
    } catch (e) {
      return out;
    }
  };

  const loadGarden = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      await initGarden();
      const gardenData = await getGarden();
      const globalData = await getGlobalData();
      const needsWorldMigration = gardenData.layoutVersion !== 2;
      let migratedGardenData = gardenData;

      if (needsWorldMigration) {
        const migratedPositions = {
          ...(gardenData.positions || {}),
        };

        for (const plant of gardenData.plants || []) {
          const currentPosition = migratedPositions[plant.id];
          if (!currentPosition) continue;
          if (currentPosition.x >= width) continue;

          migratedPositions[plant.id] = {
            ...currentPosition,
            x: currentPosition.x + width,
          };
        }

        migratedGardenData = {
          ...gardenData,
          layoutVersion: 2,
          positions: migratedPositions,
        };

        await updateGarden(migratedGardenData);
      }

      // 嘗試一次性領取（若尚未領取過）並更新本機施肥
      const userId = await getDeviceId();
      if (userId) {
        try {
          const totalClaimed = await claimPendingRewardsOnce(userId);
          const updatedGlobalData = await getGlobalData();
          setFertilizers(updatedGlobalData.fertilizers || 0);

          if (totalClaimed > 0) {
            Alert.alert(
              "獎勵",
              `你獲得了 ${totalClaimed} 次施肥！已加入施肥庫存。`,
            );
          }
        } catch (e) {
          console.error("花園領取待處理獎勵失敗:", e);
          setFertilizers(globalData.fertilizers || 0);
        }
      } else {
        setFertilizers(globalData.fertilizers || 0);
      }

      const refreshedGardenData = needsWorldMigration
        ? migratedGardenData
        : await getGarden();
      setGarden(refreshedGardenData);
      setWaterDrops(globalData.waterDrops || 0);

      if (!plantFocusVisible && !hasInitializedCameraRef.current) {
        applyCamera(
          -width,
          0,
          1,
          refreshedGardenData.plants?.length || 0,
          false,
        );
        hasInitializedCameraRef.current = true;
      }

      const positions: Record<string, { x: number; y: number }> =
        refreshedGardenData.positions || {};
      const zoneCount = getUnlockedZoneCount(
        refreshedGardenData.plants?.length || 0,
      );
      const maxVisibleY = Math.max(0, sceneContentHeight - PLANT_SIZE);

      refreshedGardenData.plants?.forEach((plant: any, index: number) => {
        if (!positions[plant.id]) {
          positions[plant.id] = getDefaultWorldPosition(
            index,
            refreshedGardenData.plants?.length || 0,
            zoneCount,
          );
        } else if (positions[plant.id].y > maxVisibleY) {
          positions[plant.id] = {
            ...positions[plant.id],
            y: maxVisibleY,
          };
        }
      });

      setPlantPositions(positions);
      plantPositionsRef.current = positions;
      setDraftPlantPositions({});
      draftPlantPositionsRef.current = {};

      const restoredLockedPlants = new Set<string>();
      gardenData.plants?.forEach((plant: any) => {
        if (plant.locked) {
          restoredLockedPlants.add(plant.id);
        }
      });
      setLockedPlants(restoredLockedPlants);
    } catch (error) {
      console.error("加載花園失敗:", error);
    } finally {
      setLoading(false);
    }
  }, [applyCamera, plantFocusVisible, sceneContentHeight]);

  useEffect(() => {
    loadGarden();
  }, [loadGarden]);

  useEffect(() => {
    const unsubscribe = subscribeGardenChanges(() => {
      if (mountedRef.current) {
        loadGarden();
      }
    });

    return unsubscribe;
  }, [loadGarden]);

  useEffect(() => {
    applyCamera(
      scenePanXRef.current,
      scenePanYRef.current,
      cameraScaleRef.current,
      garden?.plants?.length || 0,
      false,
    );
  }, [
    applyCamera,
    garden?.plants?.length,
    gardenAreaLayout.height,
    gardenAreaLayout.width,
    sceneContentHeight,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (mountedRef.current) {
        loadGarden();
      }
      return () => {};
    }, [loadGarden]),
  );

  // 定期檢查植物是否已死亡
  useEffect(() => {
    const checkDeadPlants = async () => {
      if (!mountedRef.current || !garden?.plants) return;

      try {
        const deadPlants: string[] = [];
        garden.plants.forEach((plant: any) => {
          if (isPlantDead(plant)) {
            deadPlants.push(plant.id);
          }
        });

        if (deadPlants.length > 0) {
          // 移除所有已死亡的植物
          for (const plantId of deadPlants) {
            await removePlant(plantId);
          }

          // 更新本地狀態
          const updatedGarden = await getGarden();
          if (mountedRef.current) {
            setGarden(updatedGarden);
            setPlantPositions(updatedGarden.positions || {});
            plantPositionsRef.current = updatedGarden.positions || {};
            setDraftPlantPositions({});
            draftPlantPositionsRef.current = {};

            // 如果當前焦點植物已死亡，關閉焦點視圖
            if (selectedPlant && deadPlants.includes(selectedPlant.id)) {
              setPlantFocusVisible(false);
              setSelectedPlant(null);
              Alert.alert("植物已枯萎", "您的植物未及時澆水，已經枯萎了 💀");
            }
          }
        }
      } catch (error) {
        console.error("檢查植物死亡狀態失敗:", error);
      }
    };

    // 每 30 秒檢查一次
    const interval = setInterval(checkDeadPlants, 30000);

    return () => clearInterval(interval);
  }, [garden?.plants, selectedPlant]);

  const createPanResponder = (plantId: string, plant?: any) => {
    const animatedPos = getAnimatedPlantPosition(plantId);

    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => {
        if (lockedPlants.has(plantId)) return false;
        if (
          isDraggingPlantRef.current &&
          activePlantDragIdRef.current !== plantId
        ) {
          return false;
        }
        return true;
      },
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        if (lockedPlants.has(plantId)) return false;
        if (
          isDraggingPlantRef.current &&
          activePlantDragIdRef.current !== plantId
        ) {
          return false;
        }
        return Math.abs(gestureState.dx) > 0 || Math.abs(gestureState.dy) > 0;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => !isDraggingPlantRef.current,
      onShouldBlockNativeResponder: () => false,
      onPanResponderGrant: () => {
        if (lockedPlants.has(plantId)) return;
        isDraggingPlantRef.current = true;
        activePlantDragIdRef.current = plantId;
        animatedPos.stopAnimation();
        animatedPos.setValue({ x: 0, y: 0 });
        const pos = draftPlantPositionsRef.current[plantId] ||
          plantPositions[plantId] || { x: 0, y: 0 };
        dragStartPos.current = { x: pos.x, y: pos.y };
      },
      onPanResponderMove: (_evt: any, gestureState: any) => {
        if (lockedPlants.has(plantId)) return;
        const startPos = dragStartPos.current;

        const newPos = {
          x: startPos.x + gestureState.dx,
          y: startPos.y + gestureState.dy,
        };

        const maxY = Math.max(0, sceneContentHeight - PLANT_SIZE);
        const minY = 0;
        const cameraLeft = Math.max(
          0,
          Math.min(
            -scenePanXRef.current / Math.max(cameraScaleRef.current, 0.0001),
            WORLD_WIDTH - gardenAreaLayout.width,
          ),
        );
        const xBounds = {
          min: Math.max(0, cameraLeft - 60),
          max: Math.min(
            WORLD_WIDTH - PLANT_SIZE,
            cameraLeft + gardenAreaLayout.width - PLANT_SIZE + 60,
          ),
        };

        newPos.x = Math.max(xBounds.min, Math.min(newPos.x, xBounds.max));
        newPos.y = Math.max(minY, Math.min(newPos.y, maxY));

        animatedPos.setValue({
          x: newPos.x - startPos.x,
          y: newPos.y - startPos.y,
        });

        draftPlantPositionsRef.current = {
          ...draftPlantPositionsRef.current,
          [plantId]: newPos,
        };
      },
      onPanResponderRelease: (_evt: any, gestureState: any) => {
        const moved =
          Math.abs(gestureState?.dx || 0) > 6 ||
          Math.abs(gestureState?.dy || 0) > 6;

        // 放開時只保留預覽位置 (draft)，不要自動儲存為正式位置。
        // 使用者必須按下打勾 (handleLockPlant) 才會真正提交位置。
        try {
          if (draftPlantRafRef.current != null) {
            cancelAnimationFrame(draftPlantRafRef.current);
            draftPlantRafRef.current = null;
          }
          // 動畫回位，但保留 draftPlantPositionsRef 中的預覽位置
          const previewPos = draftPlantPositionsRef.current[plantId];
          if (previewPos) {
            plantPositionsRef.current = {
              ...plantPositionsRef.current,
              [plantId]: previewPos,
            };
            setPlantPositions((prev) => ({
              ...prev,
              [plantId]: previewPos,
            }));
            setDraftPlantPositions((prev) => ({
              ...prev,
              [plantId]: previewPos,
            }));
          }
          pendingDragResetPlantIdRef.current = plantId;
          setDragResetToken((token) => token + 1);
        } catch (e) {
          console.error("拖曳釋放時處理失敗", e);
        } finally {
          if (!moved && plant && typeof runOpenFocusAnimation === "function") {
            runOpenFocusAnimation(plant);
          }

          isDraggingPlantRef.current = false;
          activePlantDragIdRef.current = null;
        }
      },
      onPanResponderTerminate: () => {
        if (draftPlantRafRef.current != null) {
          cancelAnimationFrame(draftPlantRafRef.current);
          draftPlantRafRef.current = null;
        }
        pendingDragResetPlantIdRef.current = plantId;
        setDragResetToken((token) => token + 1);
        isDraggingPlantRef.current = false;
        activePlantDragIdRef.current = null;
      },
    });

    return responder;
  };

  useLayoutEffect(() => {
    const plantId = pendingDragResetPlantIdRef.current;
    if (!plantId) return;

    const animatedPos = plantAnimatedPositionsRef.current[plantId];
    if (animatedPos) {
      animatedPos.setValue({ x: 0, y: 0 });
    }

    pendingDragResetPlantIdRef.current = null;
  }, [dragResetToken]);

  const scenePanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      if (isDraggingPlantRef.current) return false;
      if (plantFocusVisible) return false;
      if (hasUnlockedPlantsRef.current) return false;
      if ((evt.nativeEvent.touches || []).length >= 2) return true;
      return Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6;
    },
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderGrant: (evt) => {
      if (isDraggingPlantRef.current) return;
      if (hasUnlockedPlantsRef.current) return;
      scenePanStartXRef.current = scenePanXRef.current;
      scenePanStartYRef.current = scenePanYRef.current;

      const touches = evt.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const [a, b] = touches;
        const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
        pinchDistanceRef.current = distance;
        pinchStartScaleRef.current = cameraScaleRef.current;
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      if (isDraggingPlantRef.current) return;
      if (hasUnlockedPlantsRef.current) return;
      const touches = evt.nativeEvent.touches || [];
      const plantCount = garden?.plants?.length || 0;

      if (touches.length >= 2) {
        const [a, b] = touches;
        const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

        if (pinchDistanceRef.current == null) {
          pinchDistanceRef.current = distance;
          pinchStartScaleRef.current = cameraScaleRef.current;
          return;
        }

        const scaleFactor =
          distance / Math.max(1, pinchDistanceRef.current || distance);
        const nextScale = pinchStartScaleRef.current * scaleFactor;
        applyCamera(
          scenePanXRef.current,
          scenePanYRef.current,
          nextScale,
          plantCount,
        );
        return;
      }

      pinchDistanceRef.current = null;
      const nextX = scenePanStartXRef.current + gestureState.dx;
      const nextY = scenePanStartYRef.current + gestureState.dy;
      applyCamera(nextX, nextY, cameraScaleRef.current, plantCount, false);
    },
    onPanResponderRelease: () => {
      if (isDraggingPlantRef.current) return;
      if (hasUnlockedPlantsRef.current) return;
      pinchDistanceRef.current = null;
      applyCamera(
        scenePanXRef.current,
        scenePanYRef.current,
        cameraScaleRef.current,
        garden?.plants?.length || 0,
        false,
      );
    },
    onPanResponderTerminate: () => {
      pinchDistanceRef.current = null;
    },
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
  });

  const resetCamera = useCallback(() => {
    applyCamera(-width, 0, 1, garden?.plants?.length || 0, false);
  }, [applyCamera, garden?.plants?.length]);

  const handleLockPlant = async (plantId: string) => {
    if (!garden) return;

    const confirmedPos =
      draftPlantPositionsRef.current[plantId] ||
      draftPlantPositions[plantId] ||
      plantPositionsRef.current[plantId] ||
      plantPositions[plantId];
    if (!confirmedPos) return;
    const updatedPlants = (garden.plants || []).map((plant: any) =>
      plant.id === plantId ? { ...plant, locked: true } : plant,
    );

    const nextPositions = {
      ...plantPositionsRef.current,
      [plantId]: confirmedPos,
    };

    setGarden({ ...garden, plants: updatedPlants });
    plantPositionsRef.current = nextPositions;
    setPlantPositions(nextPositions);
    draftPlantPositionsRef.current = {
      ...draftPlantPositionsRef.current,
      [plantId]: confirmedPos,
    };
    setDraftPlantPositions((prev) => {
      const nextDraft = { ...prev };
      delete nextDraft[plantId];
      return nextDraft;
    });
    await updateGarden({
      ...garden,
      plants: updatedPlants,
      positions: nextPositions,
    });

    setLockedPlants((prev) => new Set(prev).add(plantId));
  };

  const handleUnlockPlant = useCallback(
    async (plantId: string) => {
      if (!garden) return;

      const updatedPlants = (garden.plants || []).map((plant: any) =>
        plant.id === plantId ? { ...plant, locked: false } : plant,
      );

      setGarden({ ...garden, plants: updatedPlants });
      setLockedPlants((prev) => {
        const next = new Set(prev);
        next.delete(plantId);
        return next;
      });

      await updateGarden({
        ...garden,
        plants: updatedPlants,
        positions: plantPositionsRef.current,
      });
    },
    [garden],
  );

  const useWaterDrop = async () => {
    if (waterDrops <= 0 || !selectedPlant || !garden) {
      Alert.alert("提醒", "水滴不足，無法澆水");
      return;
    }

    try {
      const updatedPlants = (garden.plants || []).map((plant: any) =>
        plant.id === selectedPlant.id
          ? {
              ...plant,
              lifeExpireAt: new Date(
                new Date(plant.lifeExpireAt || Date.now()).getTime() +
                  12 * 60 * 60 * 1000,
              ).toISOString(),
            }
          : plant,
      );

      setGarden({ ...garden, plants: updatedPlants });
      setSelectedPlant({
        ...selectedPlant,
        lifeExpireAt: updatedPlants.find((p: any) => p.id === selectedPlant.id)
          ?.lifeExpireAt,
      });

      await updateGarden({
        ...garden,
        plants: updatedPlants,
        positions: plantPositionsRef.current,
      });

      const newWaterDrops = waterDrops - 1;
      setWaterDrops(newWaterDrops);
      await updateGlobalData({ waterDrops: newWaterDrops });

      Alert.alert(
        "成功",
        `已澆水！植物生命延長 12 小時\n剩餘水滴: ${newWaterDrops}`,
      );
    } catch (e) {
      console.error("澆水失敗", e);
      Alert.alert("錯誤", "澆水失敗");
    }
  };

  const useFertilizer = async () => {
    if (fertilizers <= 0 || !selectedPlant || !garden) {
      Alert.alert("提醒", "施肥不足，無法施肥");
      return;
    }

    try {
      const currentImageIndex =
        typeof selectedPlant.imageIndex === "number"
          ? selectedPlant.imageIndex
          : -1;
      if (currentImageIndex <= -6) {
        Alert.alert("提醒", "這株植物已經是最終型態了");
        return;
      }

      const nextImageIndex = Math.max(-6, currentImageIndex - 2);

      const updatedPlants = (garden.plants || []).map((plant: any) =>
        plant.id === selectedPlant.id
          ? {
              ...plant,
              imageIndex: nextImageIndex,
            }
          : plant,
      );

      setGarden({ ...garden, plants: updatedPlants });
      setSelectedPlant({
        ...selectedPlant,
        imageIndex: nextImageIndex,
      });

      await updateGarden({
        ...garden,
        plants: updatedPlants,
        positions: plantPositionsRef.current,
      });

      const newFertilizers = fertilizers - 1;
      setFertilizers(newFertilizers);
      await updateGlobalData({ fertilizers: newFertilizers });

      Alert.alert(
        "成功",
        nextImageIndex <= -6
          ? `已施肥！植物已成長到最終型態\n剩餘施肥: ${newFertilizers}`
          : `已施肥！植物已往下一階段成長\n剩餘施肥: ${newFertilizers}`,
      );
    } catch (e) {
      console.error("施肥失敗", e);
      Alert.alert("錯誤", "施肥失敗");
    }
  };

  const getPlantVisualStage = (plant: any) => {
    const imageIndex =
      typeof plant?.imageIndex === "number" ? plant.imageIndex : -1;
    return Math.max(0, Math.min(5, Math.abs(imageIndex || -1) - 1));
  };

  const getPlantStage = (plant: any) => {
    const stages = ["種子", "發芽", "幼苗", "小草", "小花", "花"];
    return stages[getPlantVisualStage(plant)] || "種子";
  };

  const formatPostTime = (time: any) => {
    if (!time) return "未知";
    if (typeof time?.toDate === "function") {
      return time.toDate().toLocaleDateString("zh-TW");
    }
    return new Date(time).toLocaleDateString("zh-TW");
  };

  const getGrowthHistory = (plant: any) => {
    const replies = plant?.repliesCount || 0;
    const stage = getPlantStage(plant);
    const visualStage = getPlantVisualStage(plant);
    const nextStageNames = ["發芽", "幼苗", "小草", "小花", "花"];

    const timeline = [
      `播種完成：${new Date(plant.createdAt).toLocaleDateString("zh-TW")}`,
      `目前階段：${stage}（累積 ${replies} 則回覆）`,
    ];

    if (visualStage < 5) {
      timeline.push(`下一階段：${nextStageNames[visualStage]}`);
    } else {
      timeline.push("已達最終型態");
    }

    return timeline;
  };

  const getPlantFocusWorldPoint = useCallback(
    (plant: any) => {
      const pos = draftPlantPositions[plant.id] ||
        plantPositionsRef.current[plant.id] || { x: 0, y: 0 };
      const touchStyle = getLockedTouchStyle(plant);
      const touchLeft =
        typeof touchStyle.left === "number" ? touchStyle.left : 0;
      const touchTop = typeof touchStyle.top === "number" ? touchStyle.top : 0;
      const touchWidth =
        typeof touchStyle.width === "number" ? touchStyle.width : PLANT_SIZE;
      const touchHeight =
        typeof touchStyle.height === "number" ? touchStyle.height : PLANT_SIZE;

      return {
        x: pos.x + touchLeft + touchWidth / 2,
        y: pos.y + touchTop + touchHeight / 2,
      };
    },
    [draftPlantPositions],
  );

  const focusPlant = useCallback(
    (plant: any) => {
      const worldFocus = getPlantFocusWorldPoint(plant);
      const viewportWidth = Math.max(1, gardenAreaLayout.width || width);
      const viewportHeight = Math.max(1, gardenAreaLayout.height || height);
      // 把視窗中心往上偏移（可視化更佳）
      const viewportCenter = {
        x: viewportWidth / 2,
        y: viewportHeight / 2 - FOCUS_SCREEN_OFFSET_Y,
      };

      const scale = cameraScaleRef.current || 1;

      // 計算未裁切的目標 scenePan
      const rawTargetPanX = viewportCenter.x - worldFocus.x * scale;
      const rawTargetPanY = viewportCenter.y - worldFocus.y * scale;

      // 取得裁切後的最終目標（允許 overflow 以致於可把邊緣植物置中）
      const clamped = clampCamera(
        rawTargetPanX,
        rawTargetPanY,
        scale,
        garden?.plants?.length || 0,
        true,
      );

      // 設定選擇狀態，但用動畫移動相機（不要立刻跳過去）
      setSelectedPlant(plant);
      setFocusedPost(null);
      setPlantFocusVisible(true);

      // 初始化 overlay/focus card 狀態
      overlayOpacity.setValue(0);
      focusCardOpacity.setValue(0);
      focusCardScale.setValue(0.96);

      // 先啟動 overlay 與 focus card 的動畫（native driver 可用）
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(focusCardOpacity, {
          toValue: 1,
          duration: 260,
          delay: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(focusCardScale, {
          toValue: 1,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start();

      // 使用 JS-driven requestAnimationFrame 做平滑 pan（避免 native driver 與複合 transform 的問題）
      panAnimationCancelRef.current = false;
      const animatePanTo = (toX: number, toY: number, duration = 420) =>
        new Promise<void>((resolve) => {
          const startX = scenePanXRef.current;
          const startY = scenePanYRef.current;
          const startTime = Date.now();
          const easingFn = Easing.out(Easing.cubic);

          const step = () => {
            if (panAnimationCancelRef.current) {
              resolve();
              return;
            }
            const now = Date.now();
            const t = Math.min(1, (now - startTime) / duration);
            const eased = easingFn(t) as number;
            const nextX = startX + (toX - startX) * eased;
            const nextY = startY + (toY - startY) * eased;
            scenePanX.setValue(nextX);
            scenePanY.setValue(nextY);
            if (t < 1) {
              requestAnimationFrame(step);
            } else {
              // 確保最終值精準
              scenePanX.setValue(toX);
              scenePanY.setValue(toY);
              resolve();
            }
          };

          requestAnimationFrame(step);
        });

      animatePanTo(clamped.x, clamped.y, 420).then(() => {
        // 完成後同步 refs
        scenePanXRef.current = clamped.x;
        scenePanYRef.current = clamped.y;
        cameraScaleRef.current = scale;

        // 清除 zoom 補償（保持一致狀態）
        zoomTranslateX.setValue(0);
        zoomTranslateY.setValue(0);
        zoomScale.setValue(1);
        zoomTranslateXRef.current = 0;
        zoomTranslateYRef.current = 0;
        focusZoomScaleRef.current = 1;
      });
    },
    [
      clampCamera,
      garden?.plants?.length,
      gardenAreaLayout.width,
      gardenAreaLayout.height,
      getPlantFocusWorldPoint,
      overlayOpacity,
      focusCardOpacity,
      focusCardScale,
      zoomTranslateX,
      zoomTranslateY,
      zoomScale,
      applyCamera,
    ],
  );

  const measurePlantCenterOnScreen = useCallback((plantId: string) => {
    return new Promise<{ x: number; y: number } | null>((resolve) => {
      const targetRef = plantTouchRefs.current[plantId];
      if (!targetRef || typeof targetRef.measureInWindow !== "function") {
        resolve(null);
        return;
      }

      targetRef.measureInWindow(
        (x: number, y: number, w: number, h: number) => {
          if (
            ![x, y, w, h].every((v) => Number.isFinite(v)) ||
            w <= 0 ||
            h <= 0
          ) {
            resolve(null);
            return;
          }

          resolve({
            x: x + w / 2,
            y: y + h / 2,
          });
        },
      );
    });
  }, []);

  const measureViewportCenterOnScreen = useCallback(() => {
    return new Promise<{ x: number; y: number }>((resolve) => {
      const viewportNode = sceneViewportRef.current;
      if (!viewportNode || typeof viewportNode.measureInWindow !== "function") {
        resolve({
          x: Math.max(1, gardenAreaLayout.width || width) / 2,
          y: Math.max(1, gardenAreaLayout.height || height) / 2,
        });
        return;
      }

      viewportNode.measureInWindow(
        (x: number, y: number, w: number, h: number) => {
          if (
            ![x, y, w, h].every((v) => Number.isFinite(v)) ||
            w <= 0 ||
            h <= 0
          ) {
            resolve({
              x: Math.max(1, gardenAreaLayout.width || width) / 2,
              y: Math.max(1, gardenAreaLayout.height || height) / 2,
            });
            return;
          }

          resolve({ x: x + w / 2, y: y + h / 2 });
        },
      );
    });
  }, [gardenAreaLayout.width, gardenAreaLayout.height]);

  const trackPlantToViewportCenter = useCallback(
    async (plantId: string, maxSteps = 8) => {
      for (let i = 0; i < maxSteps; i += 1) {
        const measuredCenter = await measurePlantCenterOnScreen(plantId);
        if (!measuredCenter) return;

        const viewportCenter = await measureViewportCenterOnScreen();
        const errorX = viewportCenter.x - measuredCenter.x;
        const errorY = viewportCenter.y - measuredCenter.y;

        if (Math.abs(errorX) <= 1 && Math.abs(errorY) <= 1) {
          return;
        }

        const totalScale = Math.max(
          0.0001,
          cameraScaleRef.current * focusZoomScaleRef.current,
        );

        const correctedX = zoomTranslateXRef.current + errorX / totalScale;
        const correctedY = zoomTranslateYRef.current + errorY / totalScale;

        zoomTranslateXRef.current = correctedX;
        zoomTranslateYRef.current = correctedY;
        zoomTranslateX.setValue(correctedX);
        zoomTranslateY.setValue(correctedY);

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
    },
    [
      measurePlantCenterOnScreen,
      measureViewportCenterOnScreen,
      zoomTranslateX,
      zoomTranslateY,
    ],
  );

  const runOpenFocusAnimation = useCallback(
    (plant: any) => {
      // 先將場景置中到植物位置（不縮放），再執行放大動畫
      const zoom = width >= 900 ? 1.85 : 2.1;
      const viewportWidth = Math.max(1, gardenAreaLayout.width || width);
      const viewportHeight = Math.max(1, gardenAreaLayout.height || height);
      const worldFocus = getPlantFocusWorldPoint(plant);
      const currentScale = cameraScaleRef.current;

      // 計算將 worldFocus 移到 viewport 中心時的 scenePan
      const viewportCenter = { x: viewportWidth / 2, y: viewportHeight / 2 };
      const targetPanX = viewportCenter.x - worldFocus.x * currentScale;
      const targetPanY = viewportCenter.y - worldFocus.y * currentScale;

      // 先直接套用 camera（置中）以避免動畫起始時座標錯位
      applyCamera(
        targetPanX,
        targetPanY,
        currentScale,
        garden?.plants?.length || 0,
        true,
      );

      // 要放大的最終 scale 與對應的 scenePan（直接計算）
      const finalScale = currentScale * zoom;
      const targetPanXForFinal = viewportCenter.x - worldFocus.x * finalScale;
      const targetPanYForFinal = viewportCenter.y - worldFocus.y * finalScale;

      setSelectedPlant(plant);
      setFocusedPost(null);
      setPlantFocusVisible(true);

      overlayOpacity.setValue(0);
      focusCardOpacity.setValue(0);
      focusCardScale.setValue(0.96);

      // 同時動畫 cameraScale 與 scenePan 到最終值，避免用 zoomTranslate 做補償
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cameraScale, {
          toValue: finalScale,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scenePanX, {
          toValue: targetPanXForFinal,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scenePanY, {
          toValue: targetPanYForFinal,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(focusCardOpacity, {
          toValue: 1,
          duration: 260,
          delay: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(focusCardScale, {
          toValue: 1,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;

        // 同步 refs
        scenePanXRef.current = targetPanXForFinal;
        scenePanYRef.current = targetPanYForFinal;
        cameraScaleRef.current = finalScale;

        trackPlantToViewportCenter(plant.id);
      });
    },
    [
      focusCardOpacity,
      focusCardScale,
      gardenAreaLayout.height,
      gardenAreaLayout.width,
      getPlantFocusWorldPoint,
      overlayOpacity,
      sceneContentHeight,
      trackPlantToViewportCenter,
      zoomScale,
      zoomTranslateX,
      zoomTranslateY,
      applyCamera,
    ],
  );

  const closeFocusPanel = useCallback(() => {
    const pre = preFocusCameraRef.current;
    const target = pre
      ? { x: pre.x, y: pre.y, scale: pre.scale }
      : { x: -width, y: 0, scale: 1 };

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cameraScale, {
        toValue: target.scale,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scenePanX, {
        toValue: target.x,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scenePanY, {
        toValue: target.y,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(zoomTranslateX, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(zoomTranslateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(zoomScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(focusCardOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(focusCardScale, {
        toValue: 0.96,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 同步 refs
      scenePanXRef.current = target.x;
      scenePanYRef.current = target.y;
      cameraScaleRef.current = target.scale;

      setPlantFocusVisible(false);
      setSelectedPlant(null);
      setFocusedPost(null);

      // 清掉 pre-focus 狀態
      preFocusCameraRef.current = null;
    });
  }, [
    focusCardOpacity,
    focusCardScale,
    overlayOpacity,
    zoomScale,
    zoomTranslateX,
    zoomTranslateY,
    cameraScale,
    scenePanX,
    scenePanY,
  ]);

  const resetGardenViewInstant = useCallback(() => {
    overlayOpacity.setValue(0);
    zoomTranslateX.setValue(0);
    zoomTranslateY.setValue(0);
    zoomScale.setValue(1);
    zoomTranslateXRef.current = 0;
    zoomTranslateYRef.current = 0;
    focusZoomScaleRef.current = 1;
    focusCardOpacity.setValue(0);
    focusCardScale.setValue(0.96);
    applyCamera(-width, 0, 1, garden?.plants?.length || 0, false);
  }, [
    applyCamera,
    garden?.plants?.length,
    focusCardOpacity,
    focusCardScale,
    overlayOpacity,
    zoomScale,
    zoomTranslateX,
    zoomTranslateY,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadSourcePost = async () => {
      if (!plantFocusVisible || !selectedPlant?.postId) {
        setFocusedPost(null);
        return;
      }

      setLoadingPost(true);
      try {
        const postSnap = await getDoc(doc(db, "posts", selectedPlant.postId));
        if (cancelled) return;

        if (postSnap.exists()) {
          setFocusedPost({ id: postSnap.id, ...postSnap.data() });
        } else {
          setFocusedPost(null);
        }
      } catch (error) {
        console.error("載入來源貼文失敗:", error);
        if (!cancelled) {
          setFocusedPost(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingPost(false);
        }
      }
    };

    loadSourcePost();

    return () => {
      cancelled = true;
    };
  }, [plantFocusVisible, selectedPlant]);

  useEffect(() => {
    if (!selectedPlant || !garden?.plants) return;
    const stillExists = garden.plants.some(
      (plant: any) => plant.id === selectedPlant.id,
    );
    if (!stillExists) {
      setPlantFocusVisible(false);
      setSelectedPlant(null);
      setFocusedPost(null);
      setLoadingPost(false);
    }
  }, [garden?.plants, selectedPlant]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!garden) {
    return (
      <View style={styles.centerContainer}>
        <Text>無法加載花園</Text>
      </View>
    );
  }

  const sortedPlants = [...(garden.plants || [])].sort(
    (a: any, b: any) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.seedCounter}>
          <MaterialCommunityIcons name="flower" size={24} color="#4CAF50" />
          <Text style={styles.seedCountText}>{sortedPlants.length}</Text>
        </View>
        <Text style={styles.title}>花園</Text>
        <TouchableOpacity
          style={{ width: 40 }}
          onPress={() => {
            Alert.alert("清除所有植物", "確定要刪除花園中的所有植物嗎？", [
              { text: "取消", style: "cancel" },
              {
                text: "確認刪除",
                style: "destructive",
                onPress: async () => {
                  try {
                    await clearAllPlants();
                    await loadGarden();
                    Alert.alert("成功", "已清除所有植物");
                  } catch (e) {
                    Alert.alert("錯誤", "清除失敗");
                  }
                },
              },
            ]);
          }}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={24}
            color="#e53935"
          />
        </TouchableOpacity>
      </View>

      <View
        ref={sceneViewportRef}
        style={styles.sceneViewport}
        onLayout={(event) => {
          setGardenAreaLayout(event.nativeEvent.layout);
        }}
        {...scenePanResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.sceneWorld,
            {
              width: WORLD_WIDTH,
              height: sceneContentHeight,
              transform: [
                {
                  translateX: Animated.add(
                    Animated.add(scenePanX, zoomTranslateX),
                    Animated.multiply(
                      Animated.subtract(cameraScale, 1),
                      WORLD_WIDTH / 2,
                    ),
                  ),
                },
                {
                  translateY: Animated.add(
                    scenePanY,
                    Animated.add(
                      zoomTranslateY,
                      Animated.multiply(
                        Animated.subtract(cameraScale, 1),
                        sceneContentHeight / 2,
                      ),
                    ),
                  ),
                },
                { scale: Animated.multiply(cameraScale, zoomScale) },
              ],
            },
          ]}
        >
          <ImageBackground
            source={backgroundImage}
            style={[
              styles.sceneBackground,
              {
                width: WORLD_WIDTH,
                height: sceneContentHeight,
              },
            ]}
            resizeMode="cover"
          />

          <View style={styles.zoneHintLayer} pointerEvents="none">
            {getUnlockedZoneCount(sortedPlants.length) < 2 && (
              <View
                style={[
                  styles.lockedZoneOverlay,
                  { left: 0, width, height: sceneContentHeight },
                ]}
              >
                <Text style={styles.lockedZoneText}>左側花園鎖定</Text>
                <Text style={styles.lockedZoneSubText}>種滿 20 朵花解鎖</Text>
              </View>
            )}
            {getUnlockedZoneCount(sortedPlants.length) < 3 && (
              <View
                style={[
                  styles.lockedZoneOverlay,
                  { left: width * 2, width, height: sceneContentHeight },
                ]}
              >
                <Text style={styles.lockedZoneText}>右側花園鎖定</Text>
                <Text style={styles.lockedZoneSubText}>種滿 40 朵花解鎖</Text>
              </View>
            )}
          </View>

          {sortedPlants.length === 0 && (
            <View style={[styles.emptyContainer, { width: WORLD_WIDTH }]}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={styles.emptyText}>你的花園還是空的</Text>
              <Text style={styles.emptySubText}>
                發文後，對應的花朵會自動在花園長出來。
              </Text>
            </View>
          )}

          {sortedPlants.length > 0 && (
            <View
              style={[
                styles.gardenArea,
                { width: WORLD_WIDTH, height: sceneContentHeight },
              ]}
              pointerEvents={plantFocusVisible ? "none" : "auto"}
            >
              {sortedPlants.map((plant, index) => {
                const defaultPos = getDefaultWorldPosition(
                  index,
                  sortedPlants.length,
                  getUnlockedZoneCount(sortedPlants.length),
                );
                const committedPos = plantPositions[plant.id] || defaultPos;
                const previewPos =
                  draftPlantPositions[plant.id] || committedPos;
                const isActiveDrag =
                  isDraggingPlantRef.current &&
                  activePlantDragIdRef.current === plant.id;
                const pos = previewPos;
                const panResponder = createPanResponder(plant.id, plant);
                const isLocked = lockedPlants.has(plant.id);
                const dragTransform = isLocked
                  ? []
                  : [
                      ...getAnimatedPlantPosition(
                        plant.id,
                      ).getTranslateTransform(),
                    ];

                return isLocked ? (
                  <Animated.View
                    key={plant.id}
                    style={[
                      styles.plantContainer,
                      {
                        left: pos.x,
                        top: pos.y,
                        zIndex: Math.round(pos.y) + (isActiveDrag ? 10000 : 0),
                        elevation:
                          Math.round(pos.y) + (isActiveDrag ? 10000 : 0),
                      },
                    ]}
                  >
                    <View style={styles.draggablePlant} pointerEvents="none">
                      <FlowerCard
                        plant={plant}
                        imageSizes={DEFAULT_PLANT_IMAGE_SIZES}
                        imageOffsets={DEFAULT_PLANT_IMAGE_OFFSETS}
                        imageXOffsets={DEFAULT_PLANT_IMAGE_XOFFSETS}
                      />
                    </View>

                    <TouchableOpacity
                      ref={(node) => {
                        plantTouchRefs.current[plant.id] = node;
                      }}
                      style={[
                        styles.touchArea,
                        getLockedTouchStyle(plant),
                        {
                          zIndex:
                            Math.round(pos.y) + (isActiveDrag ? 10000 : 0) + 2,
                          elevation:
                            Math.round(pos.y) + (isActiveDrag ? 10000 : 0) + 2,
                        },
                      ]}
                      activeOpacity={0.9}
                      onPress={() => runOpenFocusAnimation(plant)}
                    />
                  </Animated.View>
                ) : (
                  <Animated.View
                    key={plant.id}
                    style={[
                      styles.plantContainer,
                      {
                        left: pos.x,
                        top: pos.y,
                      },
                      {
                        zIndex: Math.round(pos.y) + (isActiveDrag ? 10000 : 0),
                        elevation:
                          Math.round(pos.y) + (isActiveDrag ? 10000 : 0),
                      },
                      ...(dragTransform.length
                        ? [{ transform: dragTransform }]
                        : []),
                    ]}
                  >
                    <View style={styles.draggablePlant} pointerEvents="none">
                      <FlowerCard
                        plant={plant}
                        imageSizes={DEFAULT_PLANT_IMAGE_SIZES}
                        imageOffsets={DEFAULT_PLANT_IMAGE_OFFSETS}
                        imageXOffsets={DEFAULT_PLANT_IMAGE_XOFFSETS}
                      />
                    </View>

                    <View
                      style={[
                        styles.dragTouchArea,
                        getLockedTouchStyle(plant),
                        {
                          zIndex:
                            Math.round(pos.y) + (isActiveDrag ? 10000 : 0) + 2,
                          elevation:
                            Math.round(pos.y) + (isActiveDrag ? 10000 : 0) + 2,
                        },
                      ]}
                      {...(panResponder.panHandlers as any)}
                    />

                    <TouchableOpacity
                      style={styles.confirmButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => handleLockPlant(plant.id)}
                    >
                      <MaterialCommunityIcons
                        name="check"
                        size={16}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </Animated.View>
      </View>

      <View style={styles.cameraControls} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.cameraControlButton}
          onPress={resetCamera}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="crosshairs-gps"
            size={18}
            color="#1B5E20"
          />
        </TouchableOpacity>
      </View>

      {plantFocusVisible && selectedPlant && (
        <Animated.View
          style={[styles.focusOverlay, { opacity: overlayOpacity }]}
        >
          <TouchableOpacity
            style={styles.focusBackdrop}
            activeOpacity={1}
            onPress={closeFocusPanel}
          />

          <View style={styles.focusStage} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.focusCard,
                {
                  opacity: focusCardOpacity,
                  transform: [{ scale: focusCardScale }],
                },
              ]}
            >
              <View style={styles.focusHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.focusPlantName}>
                    {selectedPlant.name}
                  </Text>
                  <Text style={styles.focusPlantSubtitle}>
                    {selectedPlant.rarity || "一般"} ・{" "}
                    {getFallbackEmoji(selectedPlant)}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={closeFocusPanel}
                  style={styles.focusCloseButton}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={24}
                    color="#2E7D32"
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.focusScroll}
                contentContainerStyle={styles.focusDetailContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.plantInfoSection}>
                  <Text style={styles.infoLabel}>狀態</Text>
                  <Text style={styles.infoValue}>
                    {getPlantStage(selectedPlant)}
                  </Text>
                </View>

                <View style={styles.plantInfoSection}>
                  <Text style={styles.infoLabel}>回覆數</Text>
                  <Text style={styles.infoValue}>
                    {selectedPlant.repliesCount || 0}
                  </Text>
                </View>

                <View style={styles.plantInfoSection}>
                  <Text style={styles.infoLabel}>種植日期</Text>
                  <Text style={styles.infoValue}>
                    {new Date(selectedPlant.createdAt).toLocaleDateString(
                      "zh-TW",
                    )}
                  </Text>
                </View>

                <View style={styles.plantInfoSection}>
                  <Text style={styles.infoLabel}>剩餘生命</Text>
                  <Text
                    style={[
                      styles.infoValue,
                      getPlantRemainingLife(selectedPlant) <= 12 &&
                        styles.lifeWarning,
                    ]}
                  >
                    {getPlantRemainingLife(selectedPlant) === Infinity
                      ? "永久"
                      : `${Math.ceil(getPlantRemainingLife(selectedPlant))} 小時`}
                  </Text>
                </View>

                <View style={styles.extraSection}>
                  <Text style={styles.infoLabel}>來源貼文</Text>
                  {loadingPost ? (
                    <Text style={styles.infoValue}>載入中...</Text>
                  ) : focusedPost ? (
                    <>
                      <Text style={styles.sourcePostTitle} numberOfLines={2}>
                        {focusedPost.text || "（沒有文字內容）"}
                      </Text>
                      <Text style={styles.sourcePostMeta}>
                        發布日期：{formatPostTime(focusedPost.createdAt)}
                      </Text>
                      <Text style={styles.sourcePostMeta}>
                        標籤：{focusedPost.tag || "未設定"}
                      </Text>
                      <Text style={styles.sourcePostMeta}>
                        讚數：{focusedPost.likes || 0} ・ 留言：
                        {(focusedPost.comments || []).length}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.sourcePostMeta}>
                      找不到對應貼文（ID：{selectedPlant.postId || "無"}）
                    </Text>
                  )}
                </View>

                <View style={styles.extraSection}>
                  <Text style={styles.infoLabel}>成長歷程</Text>
                  {getGrowthHistory(selectedPlant).map((item, idx) => (
                    <View
                      key={`${selectedPlant.id}_timeline_${idx}`}
                      style={styles.timelineRow}
                    >
                      <View style={styles.timelineDot} />
                      <Text style={styles.timelineText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.actionRowInFocus}>
                  <TouchableOpacity
                    style={styles.moveButton}
                    onPress={async () => {
                      if (!selectedPlant) return;
                      const movePlantId = selectedPlant.id;
                      closeFocusPanel();
                      await handleUnlockPlant(movePlantId);
                    }}
                  >
                    <Text style={styles.moveButtonText}>移動植物</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => {
                      Alert.alert("確認", "確定要刪除此植物嗎？", [
                        { text: "取消", style: "cancel" },
                        {
                          text: "刪除",
                          style: "destructive",
                          onPress: async () => {
                            if (!selectedPlant) return;
                            const deletingPlantId = selectedPlant.id;
                            resetGardenViewInstant();
                            setPlantFocusVisible(false);
                            setSelectedPlant(null);
                            setFocusedPost(null);
                            setLoading(true);
                            try {
                              await removePlant(deletingPlantId);
                              await loadGarden();
                            } catch (e) {
                              console.error("刪除植物失敗", e);
                              Alert.alert("錯誤", "刪除植物失敗");
                            } finally {
                              setLoading(false);
                            }
                          },
                        },
                      ]);
                    }}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.deleteButtonText}>刪除植物</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.actionRowInFocus}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.waterDropButton]}
                    onPress={useWaterDrop}
                  >
                    <MaterialCommunityIcons
                      name="water-outline"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.actionButtonText}>
                      澆水 ({waterDrops}/30)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.fertilizerButton]}
                    onPress={useFertilizer}
                  >
                    <MaterialCommunityIcons
                      name="leaf"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.actionButtonText}>
                      施肥 ({fertilizers}/30)
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Animated.View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  sceneViewport: {
    left: 0,
    height: "100%",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    zIndex: 1000,
  },
  seedCounter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  seedCountText: {
    marginLeft: 6,
    fontSize: 18,
    fontWeight: "700",
    color: "#2E7D32",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1B5E20",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1B5E20",
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  gardenArea: {
    position: "relative",
    height: "100%",
  },
  sceneWorld: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  sceneBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
  },
  plantContainer: {
    position: "absolute",
    width: PLANT_SIZE,
    height: PLANT_SIZE,
  },
  touchArea: {
    position: "absolute",
    width: 25,
    height: 30,
    left: (PLANT_SIZE - 25) / 2,
    top: (PLANT_SIZE - 30) / 2 + 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 8,
  },
  dragTouchArea: {
    position: "absolute",
    width: 25,
    height: 30,
    left: (PLANT_SIZE - 25) / 2,
    top: (PLANT_SIZE - 30) / 2 + 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 8,
  },
  draggablePlant: {
    width: PLANT_SIZE,
    height: PLANT_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButton: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 1000,
    elevation: 1000,
  },
  zoneHintLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  lockedZoneOverlay: {
    position: "absolute",
    top: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(23, 53, 32, 0.18)",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  lockedZoneText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
    textShadowColor: "rgba(0, 0, 0, 0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lockedZoneSubText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.95)",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  focusOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  focusBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  focusStage: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  focusCard: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "30%",
    backgroundColor: "rgba(246, 251, 245, 0.97)",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(215, 232, 213, 0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 8,
  },
  focusHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#D7E8D5",
  },
  focusPlantName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1B5E20",
  },
  focusPlantSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#3B6A3D",
    fontWeight: "600",
  },
  focusCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  focusScroll: {
    maxHeight: 220,
  },
  focusDetailContent: {
    padding: 18,
    paddingBottom: 22,
  },
  plantInfoSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  infoLabel: {
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B5E20",
  },
  lifeWarning: {
    color: "#D32F2F",
  },
  extraSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  sourcePostTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#245A2B",
    marginBottom: 6,
    lineHeight: 22,
  },
  sourcePostMeta: {
    fontSize: 13,
    color: "#5A6C59",
    marginTop: 2,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    marginTop: 7,
    marginRight: 8,
  },
  timelineText: {
    flex: 1,
    fontSize: 13,
    color: "#33593A",
    lineHeight: 20,
  },
  actionRowInFocus: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginTop: 4,
  },
  moveButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  moveButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  deleteButton: {
    borderRadius: 10,
    backgroundColor: "#D84315",
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  deleteButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  waterDropButton: {
    backgroundColor: "#2196F3",
    marginRight: 8,
  },
  fertilizerButton: {
    backgroundColor: "#FF9800",
    marginLeft: 8,
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  debugOverlay: {
    position: "absolute",
    top: 64,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 8,
    zIndex: 2000,
  },
  debugText: {
    color: "#fff",
    fontSize: 11,
  },
  cameraControls: {
    position: "absolute",
    right: 12,
    bottom: 18,
    zIndex: 1600,
    elevation: 1600,
    gap: 10,
  },
  cameraControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(27,94,32,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
});
