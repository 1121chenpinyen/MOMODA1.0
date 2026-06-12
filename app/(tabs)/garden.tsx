import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import { useFocusEffect, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
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
import PostDetailModal from "../../components/PostDetailModal";
import { useColorScheme } from "../../components/useColorScheme";
import { db } from "../../config/firebaseConfig";
import {
  DEFAULT_PLANT_IMAGE_OFFSETS,
  DEFAULT_PLANT_IMAGE_SIZES,
  DEFAULT_PLANT_IMAGE_XOFFSETS,
} from "../../constants/plantImageSizes";
import { getDeviceId } from "../../utils/getDeviceId";
import { ASSET_MAP, SEED_ASSET } from "../../utils/plantCatalog";
import {
  claimPendingRewardsOnce,
  getGarden,
  getGlobalData,
  getPlantRemainingLife,
  initGarden,
  markWiltedPlants,
  removePlant,
  subscribeGardenChanges,
  updateGarden,
  updateGlobalData,
} from "../../utils/storage";

const backgroundImage = require("../../assets/background/background.png");
const gardenLoadingAssets = [
  backgroundImage,
  SEED_ASSET,
  ...Object.values(ASSET_MAP).flat(),
];
const backgroundAsset = Image.resolveAssetSource(backgroundImage);
const BACKGROUND_ASPECT_RATIO =
  backgroundAsset.width && backgroundAsset.height
    ? backgroundAsset.width / backgroundAsset.height
    : 1;

const { width, height } = Dimensions.get("window");
const PLANT_SIZE = 10;
const LOCK_Y_OFFSET_ON_CONFIRM = 0;
const WORLD_WIDTH = width * 3;
const BACKGROUND_HEIGHT = WORLD_WIDTH / BACKGROUND_ASPECT_RATIO;
const MAX_CAMERA_SCALE = 2.2;
const MIN_INITIAL_LOADING_MS = 7000;
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
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [garden, setGarden] = useState<{ seeds: number; plants: any[] } | null>(
    null,
  );
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const [plantFocusVisible, setPlantFocusVisible] = useState<boolean>(false);
  const [focusedPost, setFocusedPost] = useState<any | null>(null);
  const [loadingPost, setLoadingPost] = useState<boolean>(false);
  const [postDetailVisible, setPostDetailVisible] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [gardenAreaLayout, setGardenAreaLayout] = useState({
    width,
    height,
  });
  const [waterDrops, setWaterDrops] = useState<number>(0);
  const [fertilizers, setFertilizers] = useState<number>(0);
  const [rewardToastVisible, setRewardToastVisible] = useState(false);
  const [rewardToastText, setRewardToastText] = useState("");
  const [rewardToastIcon, setRewardToastIcon] = useState<string>("leaf");

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
  const hasPreloadedGardenAssetsRef = useRef(false);
  const firstLoadStartedAtRef = useRef<number | null>(null);
  const rewardToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const loadingSpin = useRef(new Animated.Value(0)).current;
  const loadingPulse = useRef(new Animated.Value(0)).current;

  const showRewardToast = useCallback((text: string, icon: string = "leaf") => {
    setRewardToastText(text);
    setRewardToastIcon(icon);
    setRewardToastVisible(true);

    if (rewardToastTimerRef.current) {
      clearTimeout(rewardToastTimerRef.current);
    }

    rewardToastTimerRef.current = setTimeout(() => {
      setRewardToastVisible(false);
    }, 1800);
  }, []);

  const openPlantPostDetail = useCallback(() => {
    if (!selectedPlant?.postId) {
      Alert.alert("提醒", "這株植物沒有對應的貼文");
      return;
    }

    if (!focusedPost) {
      Alert.alert("讀取中", "貼文還在載入，請稍後再試");
      return;
    }

    setPostDetailVisible(true);
  }, [focusedPost, selectedPlant?.postId]);

  function handleFocusBackdropPress() {
    closeFocusPanel();
  }

  useEffect(() => {
    return () => {
      if (rewardToastTimerRef.current) {
        clearTimeout(rewardToastTimerRef.current);
      }
    };
  }, []);

  const preloadGardenAssets = useCallback(async () => {
    if (hasPreloadedGardenAssetsRef.current) return;

    try {
      await Promise.all(
        gardenLoadingAssets.map((asset) =>
          Asset.fromModule(asset).downloadAsync(),
        ),
      );
      hasPreloadedGardenAssetsRef.current = true;
    } catch (error) {
      console.error("預載花園素材失敗:", error);
    }
  }, []);

  useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(loadingSpin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(loadingPulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    spinAnimation.start();
    pulseAnimation.start();

    return () => {
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [loadingPulse, loadingSpin]);

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

  useEffect(() => {
    if (!selectedPlant || !garden?.plants) return;

    const latestPlant = garden.plants.find(
      (plant: any) => plant.id === selectedPlant.id,
    );

    if (!latestPlant) return;

    const shouldSyncLatestPlant =
      latestPlant.wiltedAt !== selectedPlant.wiltedAt ||
      latestPlant.imageIndex !== selectedPlant.imageIndex ||
      latestPlant.lifeExpireAt !== selectedPlant.lifeExpireAt ||
      latestPlant.repliesCount !== selectedPlant.repliesCount ||
      latestPlant.isSeedMoving !== selectedPlant.isSeedMoving ||
      latestPlant.locked !== selectedPlant.locked;

    if (shouldSyncLatestPlant) {
      setSelectedPlant(latestPlant);
    }
  }, [garden?.plants, selectedPlant]);

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
  const SEED_TOUCH_AREA_Y_SHIFT = -20;
  const STAGE_TOUCH_HEIGHTS = [30, 30, 40, 50, 75, 100];
  const getLockedTouchStyle = (
    plant: any,
    options: { forDrag?: boolean } = {},
  ) => {
    const replies =
      typeof plant?.repliesCount === "number" ? plant.repliesCount : 0;
    const imageIndex =
      typeof plant?.imageIndex === "number" ? plant.imageIndex : -1;
    const plantType = typeof plant?.type === "string" ? plant.type : "";
    const isSeedImage = plant?.isSeedMoving === true;
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
    const width = isSeedImage
      ? seedTouchSize
      : isEat2FinalFlower
        ? TOUCH_FIXED_WIDTH + 65
        : TOUCH_FIXED_WIDTH + 10;
    const height = isSeedImage
      ? seedTouchSize
      : STAGE_TOUCH_HEIGHTS[stage] + 10;
    const left = (PLANT_SIZE - width) / 2;
    const dragTouchLift = 13;
    const top = isSeedImage
      ? PLANT_SIZE - height + 13 - dragTouchLift + SEED_TOUCH_AREA_Y_SHIFT
      : PLANT_SIZE - TOUCH_BASE_BOTTOM_OFFSET - height + 25 - dragTouchLift;
    const out = {
      width,
      height,
      left,
      top,
    };

    // 預設每階段的 top 偏移（單位 px）
    // 發芽(1): -10, 幼苗(2): -5, 小草(3): +3, 小花(4): +8, 花(5): +20
    const STAGE_DEFAULT_TOP_OFFSETS: Record<number, number> = {
      1: -1,
      2: -3,
      3: -4,
      4: -4,
      5: -1,
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

      // 若植物已枯萎，放大觸碰範圍並保持底部置中
      if (plant?.wiltedAt) {
        const WILTED_SCALE = 1.8;
        const baseWidth =
          typeof merged.width === "number" ? merged.width : width;
        const baseHeight =
          typeof merged.height === "number" ? merged.height : height;
        const newWidth = baseWidth * WILTED_SCALE;
        const newHeight = baseHeight * WILTED_SCALE;

        merged.width = newWidth;
        merged.height = newHeight;
        merged.left = (PLANT_SIZE - newWidth) / 2;
        // 重新計算 top，並加回階段偏移以保留原本微調
        merged.top =
          PLANT_SIZE -
          TOUCH_BASE_BOTTOM_OFFSET -
          newHeight +
          25 -
          dragTouchLift +
          stageOffset;
      }

      // 若為拖曳模式，並且植物處於種子或發芽階段，放大拖曳觸碰範圍（點擊區不變）
      if (options.forDrag) {
        const visualStage = Math.max(
          0,
          Math.min(5, Math.abs(imageIndex || -1) - 1),
        );
        if (visualStage <= 1) {
          const DRAG_SCALE = 2;
          const baseW = typeof merged.width === "number" ? merged.width : width;
          const baseH =
            typeof merged.height === "number" ? merged.height : height;
          const newW = baseW * DRAG_SCALE;
          const newH = baseH * DRAG_SCALE;
          merged.width = newW;
          merged.height = newH;
          merged.left = (PLANT_SIZE - newW) / 2;
          merged.top =
            PLANT_SIZE -
            TOUCH_BASE_BOTTOM_OFFSET -
            newH +
            38 -
            dragTouchLift +
            stageOffset +
            (isSeedImage ? SEED_TOUCH_AREA_Y_SHIFT : 0);
        }
      }

      return merged;
    } catch (e) {
      return out;
    }
  };

  const loadGarden = useCallback(async () => {
    if (!mountedRef.current) return;

    const isFirstLoad = !hasInitializedCameraRef.current;
    if (isFirstLoad && firstLoadStartedAtRef.current == null) {
      firstLoadStartedAtRef.current = Date.now();
    }

    try {
      await preloadGardenAssets();
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
            showRewardToast(`獲得 ${totalClaimed} 個肥料`, "leaf");
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
      const normalizedGardenData = await markWiltedPlants(refreshedGardenData);
      setGarden(normalizedGardenData);
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
        normalizedGardenData.positions || {};
      const zoneCount =
        normalizedGardenData.unlockedZones !== undefined
          ? normalizedGardenData.unlockedZones
          : getUnlockedZoneCount(normalizedGardenData.plants?.length || 0);
      const maxVisibleY = Math.max(0, sceneContentHeight - PLANT_SIZE);

      normalizedGardenData.plants?.forEach((plant: any, index: number) => {
        if (!positions[plant.id]) {
          positions[plant.id] = getDefaultWorldPosition(
            index,
            normalizedGardenData.plants?.length || 0,
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

      // 如果有剛生成的植物標記，將畫面移到該植物位置，然後清除標記
      try {
        const spawnedId = normalizedGardenData.lastSpawnedPlantId;
        if (spawnedId) {
          const spawnedPlant = normalizedGardenData.plants?.find(
            (p: any) => p.id === spawnedId,
          );
          const spawnedPos =
            positions[spawnedId] || normalizedGardenData.lastSpawnedPosition;
          if (spawnedPlant && spawnedPos) {
            showRewardToast("發文成功，獲得新植物", "eat1-image");

            const worldFocus = getPlantFocusWorldPoint(spawnedPlant);
            const viewportWidth = Math.max(1, gardenAreaLayout.width || width);
            const viewportHeight = Math.max(
              1,
              gardenAreaLayout.height || height,
            );
            const viewportCenter = {
              x: viewportWidth / 2,
              y: viewportHeight / 2 - FOCUS_SCREEN_OFFSET_Y,
            };

            const scale = cameraScaleRef.current || 1;
            const rawTargetPanX = viewportCenter.x - worldFocus.x * scale;
            const rawTargetPanY = viewportCenter.y - worldFocus.y * scale;

            const clamped = clampCamera(
              rawTargetPanX,
              rawTargetPanY,
              scale,
              normalizedGardenData.plants?.length || 0,
              true,
            );

            applyCamera(
              clamped.x,
              clamped.y,
              scale,
              normalizedGardenData.plants?.length || 0,
              true,
            );

            // 清除標記，避免重複自動聚焦
            await updateGarden({
              lastSpawnedPlantId: null,
              lastSpawnedPosition: null,
            });
          }
        }
      } catch (e) {
        // 忽略錯誤
      }

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
      if (isFirstLoad && firstLoadStartedAtRef.current != null) {
        const elapsed = Date.now() - firstLoadStartedAtRef.current;
        const remaining = Math.max(0, MIN_INITIAL_LOADING_MS - elapsed);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        firstLoadStartedAtRef.current = null;
      }
      setLoading(false);
    }
  }, [
    applyCamera,
    plantFocusVisible,
    preloadGardenAssets,
    sceneContentHeight,
    showRewardToast,
  ]);

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
    const interval = setInterval(() => {
      if (mountedRef.current) {
        loadGarden();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadGarden]);

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

        // 不允許拖到未解鎖區域：交集目前允許的 x 範圍與攝影機邊界
        try {
          const allowedPlantX = getPlantXBounds((garden?.plants || []).length);
          xBounds.min = Math.max(xBounds.min, allowedPlantX.min);
          xBounds.max = Math.min(xBounds.max, allowedPlantX.max);
        } catch (e) {
          // ignore
        }

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
      if ((evt.nativeEvent.touches || []).length >= 2) return true;
      return Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6;
    },
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderGrant: (evt) => {
      if (isDraggingPlantRef.current) return;
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
        const nextScaleRaw = pinchStartScaleRef.current * scaleFactor;
        const minScale = getMinCameraScale();
        const nextScale = Math.max(
          minScale,
          Math.min(nextScaleRaw, MAX_CAMERA_SCALE),
        );

        // 如果新的尺度被夾到與目前一樣（已達到極限），不要改變相機位置，避免達邊界時位移
        if (Math.abs(nextScale - (cameraScaleRef.current || 1)) < 1e-6) {
          return;
        }

        // 計算以視窗中心為縮放中心
        const viewportWidth = Math.max(1, gardenAreaLayout.width || width);
        const viewportHeight = Math.max(1, gardenAreaLayout.height || height);
        const viewportCenter = { x: viewportWidth / 2, y: viewportHeight / 2 };

        const currentScale = cameraScaleRef.current || 1;
        const worldFocusX =
          (viewportCenter.x - scenePanXRef.current) / currentScale;
        const worldFocusY =
          (viewportCenter.y - scenePanYRef.current) / currentScale;

        const nextPanX = viewportCenter.x - worldFocusX * nextScale;
        const nextPanY = viewportCenter.y - worldFocusY * nextScale;

        applyCamera(nextPanX, nextPanY, nextScale, plantCount);
        return;
      }

      pinchDistanceRef.current = null;
      const nextX = scenePanStartXRef.current + gestureState.dx;
      const nextY = scenePanStartYRef.current + gestureState.dy;
      applyCamera(nextX, nextY, cameraScaleRef.current, plantCount, false);
    },
    onPanResponderRelease: () => {
      if (isDraggingPlantRef.current) return;
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
    // 檢查是否嘗試將植物放入未解鎖區域
    try {
      const allowedX = getPlantXBounds((garden.plants || []).length);
      if (confirmedPos.x < allowedX.min || confirmedPos.x > allowedX.max) {
        Alert.alert("無法移動", "該區域尚未解鎖，無法將植物移動到那裡");
        return;
      }
    } catch (e) {
      // ignore
    }

    const updatedPlants = (garden.plants || []).map((plant: any) =>
      plant.id === plantId
        ? { ...plant, locked: true, isSeedMoving: false }
        : plant,
    );

    const adjustedConfirmedPos = {
      x: confirmedPos.x,
      y: Math.max(
        0,
        Math.min(
          confirmedPos.y - LOCK_Y_OFFSET_ON_CONFIRM,
          Math.max(0, sceneContentHeight - PLANT_SIZE),
        ),
      ),
    };

    const nextPositions = {
      ...plantPositionsRef.current,
      [plantId]: adjustedConfirmedPos,
    };

    setGarden({ ...garden, plants: updatedPlants });
    plantPositionsRef.current = nextPositions;
    setPlantPositions(nextPositions);
    draftPlantPositionsRef.current = {
      ...draftPlantPositionsRef.current,
      [plantId]: adjustedConfirmedPos,
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
      Alert.alert("提醒", "肥料不足，無法施肥");
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
          ? `已施肥！植物已成長到最終型態\n剩餘肥料: ${newFertilizers}`
          : `已施肥！植物已往下一階段成長\n剩餘肥料: ${newFertilizers}`,
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

  const getPlantCategoryTag = (plant: any) => {
    const type = typeof plant?.type === "string" ? plant.type : "";
    const categoryMap: Record<string, string> = {
      eat1: "飲食",
      eat2: "飲食",
      mood1: "其他",
      mood2: "學業/工作",
      love1: "人際",
      love2: "人際",
      sport1: "運動",
      sport2: "運動",
      entertainment1: "娛樂",
      entertainment2: "娛樂",
      pet1: "寵物",
      pet2: "寵物",
    };
    return categoryMap[type] || "其他";
  };

  const formatPostTime = (time: any) => {
    if (!time) return "未知";
    if (typeof time?.toDate === "function") {
      return time.toDate().toLocaleDateString("zh-TW");
    }
    return new Date(time).toLocaleDateString("zh-TW");
  };

  const formatDateTime = (time: any) => {
    if (!time) return "未知";
    if (typeof time?.toDate === "function") {
      return time.toDate().toLocaleString("zh-TW");
    }
    return new Date(time).toLocaleString("zh-TW");
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
        y: pos.y + touchTop + touchHeight,
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

      // 儲存目前相機狀態，關閉時回到此狀態（而不是回到預設畫面）
      preFocusCameraRef.current = {
        x: scenePanXRef.current,
        y: scenePanYRef.current,
        scale: cameraScaleRef.current,
      };

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
            y: y + h,
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
          y:
            Math.max(1, gardenAreaLayout.height || height) / 2 -
            FOCUS_SCREEN_OFFSET_Y,
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
              y:
                Math.max(1, gardenAreaLayout.height || height) / 2 -
                FOCUS_SCREEN_OFFSET_Y,
            });
            return;
          }

          resolve({ x: x + w / 2, y: y + h / 2 - FOCUS_SCREEN_OFFSET_Y });
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

      // 計算將 worldFocus 移到偏上的視窗中心時的 scenePan
      const viewportCenter = {
        x: viewportWidth / 2,
        y: viewportHeight / 2 - FOCUS_SCREEN_OFFSET_Y,
      };
      const targetPanX = viewportCenter.x - worldFocus.x * currentScale;
      const targetPanY = viewportCenter.y - worldFocus.y * currentScale;

      // 在開始前儲存當前相機狀態，關閉時可回到此狀態
      preFocusCameraRef.current = {
        x: scenePanXRef.current,
        y: scenePanYRef.current,
        scale: cameraScaleRef.current,
      };

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

    const clampedTarget = clampCamera(
      target.x,
      target.y,
      target.scale,
      garden?.plants?.length || 0,
      false,
    );

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
        toValue: clampedTarget.x,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scenePanY, {
        toValue: clampedTarget.y,
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
      scenePanXRef.current = clampedTarget.x;
      scenePanYRef.current = clampedTarget.y;
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
      <View style={[styles.loadingScreen, isDark && styles.loadingScreenDark]}>
        <View style={styles.loadingGlow} />
        <View style={[styles.loadingCard, isDark && styles.loadingCardDark]}>
          <View style={styles.loadingOrb}>
            <Animated.View
              style={[
                styles.loadingRing,
                {
                  transform: [
                    {
                      rotate: loadingSpin.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "360deg"],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.loadingLeafWrap,
                {
                  transform: [
                    {
                      scale: loadingPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1.08],
                      }),
                    },
                  ],
                },
              ]}
            >
              <MaterialCommunityIcons
                name="leaf"
                size={40}
                color={isDark ? "#B7E4C7" : "#4CAF50"}
              />
            </Animated.View>
          </View>

          <Text style={[styles.loadingTitle, isDark && styles.textWhiteDark]}>
            花園載入中
          </Text>
          <Text
            style={[
              styles.loadingSubtitle,
              isDark && styles.loadingSubtitleDark,
            ]}
          >
            正在整理植物位置與成長資料
          </Text>
        </View>
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

  const activeZoneCount =
    (garden as any)?.unlockedZones !== undefined
      ? (garden as any).unlockedZones
      : getUnlockedZoneCount(sortedPlants.length);

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.topBar, isDark && styles.topBarDark]}>
        <View style={[styles.seedCounter, isDark && styles.seedCounterDark]}>
          <Image
            source={require("../../assets/plant/day_flower.png")}
            style={styles.seedCounterImage}
          />
          <Text style={[styles.seedCountText, isDark && styles.textWhiteDark]}>
            {sortedPlants.length}
          </Text>
        </View>
      </View>

      <View
        ref={sceneViewportRef}
        style={styles.sceneViewport}
        onLayout={(event) => {
          setGardenAreaLayout(event.nativeEvent.layout);
        }}
        {...scenePanResponder.panHandlers}
      >
        <View style={styles.floatingControls}>
          <TouchableOpacity
            style={styles.encyclopediaButtonSmall}
            onPress={() => router.push("/encyclopedia" as never)}
            activeOpacity={0.8}
          >
            <Image
              source={require("../../assets/images/icon4.png")}
              style={styles.encyclopediaIcon}
            />
          </TouchableOpacity>
        </View>

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
            {activeZoneCount < 2 && (
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
            {activeZoneCount < 3 && (
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
            <View
              style={[styles.emptyContainer, { left: width, width }]}
              pointerEvents="none"
            >
              <Text style={styles.emptyText}>這裡沒有植物ㄚㄚ</Text>
              <Text style={styles.emptySubText}>快去首頁發出第一篇貼文吧!</Text>
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
                  activeZoneCount,
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
                        getLockedTouchStyle(plant, { forDrag: true }),
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

      {rewardToastVisible ? (
        <View style={[styles.rewardToast, isDark && styles.rewardToastDark]}>
          {rewardToastIcon === "eat1-image" ? (
            <Image
              source={require("../../assets/plant/eat1/eat1-1.png")}
              style={styles.rewardToastImage}
            />
          ) : (
            <MaterialCommunityIcons
              name={rewardToastIcon as any}
              size={20}
              color={isDark ? "#FFFFFF" : "#6FA8DC"}
            />
          )}
          <Text
            style={[styles.rewardToastText, isDark && styles.rewardToastTextDark]}
          >
            {rewardToastText}
          </Text>
        </View>
      ) : null}

      <View style={styles.cameraControls} pointerEvents="box-none">
        <TouchableOpacity
          style={[
            styles.cameraControlButton,
            isDark && styles.cameraControlButtonDark,
          ]}
          onPress={resetCamera}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="crosshairs-gps"
            size={18}
            color={isDark ? "#FFFFFF" : "#1B5E20"}
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
            onPress={handleFocusBackdropPress}
          />

          <View style={styles.focusStage} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.focusCard,
                isDark && styles.focusCardDark,
                {
                  opacity: focusCardOpacity,
                  transform: [{ scale: focusCardScale }],
                },
              ]}
            >
              <View
                style={[styles.focusHeader, isDark && styles.focusHeaderDark]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.focusTitleRow}>
                    <Text
                      style={[
                        styles.focusPlantName,
                        isDark && styles.textWhiteDark,
                      ]}
                    >
                      {selectedPlant.name}
                    </Text>
                    <Text
                      style={[
                        styles.focusPlantTag,
                        isDark && styles.focusPlantTagDark,
                      ]}
                    >
                      #{getPlantCategoryTag(selectedPlant)}
                    </Text>
                  </View>
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
                {selectedPlant.wiltedAt ? (
                  <>
                    <View style={styles.plantInfoSection}>
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        狀態
                      </Text>
                      <Text
                        style={[
                          styles.infoValue,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        枯萎
                      </Text>
                    </View>

                    <View style={styles.plantInfoSection}>
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        種植日期
                      </Text>
                      <Text
                        style={[
                          styles.infoValue,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        {formatDateTime(selectedPlant.createdAt)}
                      </Text>
                    </View>

                    <View style={styles.plantInfoSection}>
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        枯萎日期跟時間
                      </Text>
                      <Text
                        style={[
                          styles.infoValue,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        {formatDateTime(selectedPlant.wiltedAt)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.extraSection, styles.sourcePostTouchArea]}
                      activeOpacity={0.85}
                      onPress={openPlantPostDetail}
                    >
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        來源貼文
                      </Text>
                      {loadingPost ? (
                        <Text
                          style={[
                            styles.infoValue,
                            isDark && styles.textWhiteDark,
                          ]}
                        >
                          載入中...
                        </Text>
                      ) : focusedPost ? (
                        <>
                          <Text
                            style={[
                              styles.sourcePostTitle,
                              isDark && styles.textWhiteDark,
                            ]}
                            numberOfLines={2}
                          >
                            {focusedPost.text || "（沒有文字內容）"}
                          </Text>
                          <Text
                            style={[
                              styles.sourcePostMeta,
                              isDark && styles.textWhiteDark,
                            ]}
                          >
                            發布日期：{formatDateTime(focusedPost.createdAt)}
                          </Text>
                        </>
                      ) : (
                        <Text
                          style={[
                            styles.sourcePostMeta,
                            isDark && styles.textWhiteDark,
                          ]}
                        >
                          找不到對應貼文（ID：{selectedPlant.postId || "無"}）
                        </Text>
                      )}
                    </TouchableOpacity>

                    <View style={styles.deleteOnlyRow}>
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
                  </>
                ) : (
                  <>
                    <View style={styles.plantInfoSection}>
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        狀態
                      </Text>
                      <Text
                        style={[
                          styles.infoValue,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        {getPlantStage(selectedPlant)}
                      </Text>
                    </View>

                    <View style={styles.plantInfoSection}>
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        種植日期
                      </Text>
                      <Text
                        style={[
                          styles.infoValue,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        {new Date(selectedPlant.createdAt).toLocaleDateString(
                          "zh-TW",
                        )}
                      </Text>
                    </View>

                    <View style={styles.plantInfoSection}>
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        剩餘生命
                      </Text>
                      <View style={styles.infoValueRow}>
                        <Text
                          style={[
                            styles.infoValue,
                            isDark && styles.textWhiteDark,
                            getPlantRemainingLife(selectedPlant) <= 12 &&
                              styles.lifeWarning,
                          ]}
                        >
                          {getPlantRemainingLife(selectedPlant) === Infinity
                            ? "永久"
                            : `${Math.ceil(getPlantRemainingLife(selectedPlant))} 小時`}
                        </Text>
                        <TouchableOpacity
                          style={styles.inlineWaterButton}
                          onPress={useWaterDrop}
                        >
                          <MaterialCommunityIcons
                            name="water-outline"
                            size={16}
                            color="#444444"
                          />
                          <Text style={styles.inlineWaterButtonText}>
                            澆水 ({waterDrops}/30)
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.extraSection, styles.sourcePostTouchArea]}
                      activeOpacity={0.85}
                      onPress={openPlantPostDetail}
                    >
                      <Text
                        style={[
                          styles.infoLabel,
                          isDark && styles.textWhiteDark,
                        ]}
                      >
                        來源貼文
                      </Text>
                      {loadingPost ? (
                        <Text
                          style={[
                            styles.infoValue,
                            isDark && styles.textWhiteDark,
                          ]}
                        >
                          載入中...
                        </Text>
                      ) : focusedPost ? (
                        <>
                          <Text
                            style={[
                              styles.sourcePostTitle,
                              isDark && styles.textWhiteDark,
                            ]}
                            numberOfLines={2}
                          >
                            {focusedPost.text || "（沒有文字內容）"}
                          </Text>
                          <Text
                            style={[
                              styles.sourcePostMeta,
                              isDark && styles.textWhiteDark,
                            ]}
                          >
                            發布日期：{formatDateTime(focusedPost.createdAt)}
                          </Text>
                        </>
                      ) : (
                        <Text
                          style={[
                            styles.sourcePostMeta,
                            isDark && styles.textWhiteDark,
                          ]}
                        >
                          找不到對應貼文（ID：{selectedPlant.postId || "無"}）
                        </Text>
                      )}
                    </TouchableOpacity>

                    <View style={styles.tripleActionRow}>
                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.tripleActionButton,
                          styles.moveButton,
                        ]}
                        onPress={async () => {
                          if (!selectedPlant) return;
                          const movePlantId = selectedPlant.id;
                          closeFocusPanel();
                          await handleUnlockPlant(movePlantId);
                        }}
                      >
                        <Text style={styles.actionButtonText}>移動</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.tripleActionButton,
                          styles.fertilizerButton,
                        ]}
                        onPress={useFertilizer}
                      >
                        <Text style={styles.actionButtonText}>
                          施肥 ({fertilizers}/30)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.tripleActionButton,
                          styles.deleteButton,
                        ]}
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
                        <Text style={styles.actionButtonText}>刪除</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      <PostDetailModal
        visible={postDetailVisible}
        post={focusedPost}
        isDark={isDark}
        onClose={() => setPostDetailVisible(false)}
        currentUserId=""
        profileMap={{}}
        sortedComments={focusedPost?.comments || []}
        commentSortMode="new"
        showCommentInput={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eeeeee",
  },
  containerDark: {
    backgroundColor: "#202624",
  },
  sceneViewport: {
    left: 0,
    height: "100%",
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EAF4EA",
    overflow: "hidden",
  },
  loadingScreenDark: {
    backgroundColor: "#1C231F",
  },
  loadingGlow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(111, 168, 220, 0.18)",
    top: "25%",
  },
  loadingCard: {
    width: "78%",
    maxWidth: 340,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  loadingCardDark: {
    backgroundColor: "rgba(33, 43, 37, 0.92)",
  },
  loadingOrb: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  loadingRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 5,
    borderColor: "rgba(76, 175, 80, 0.12)",
    borderTopColor: "#4CAF50",
    borderRightColor: "#7FBF7F",
  },
  loadingLeafWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#24442A",
    letterSpacing: 0.6,
  },
  loadingSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#5D6F62",
  },
  loadingSubtitleDark: {
    color: "#C8D6CC",
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
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: "#eeeeee",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    zIndex: 1000,
  },
  topBarDark: {
    backgroundColor: "#39443E",
    borderBottomColor: "#39443E",
  },
  floatingControls: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 30,
  },
  encyclopediaButtonSmall: {
    width: 60,
    height: 60,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0)",
    top: 5,
  },
  encyclopediaIcon: {
    width: 55,
    height: 55,
    resizeMode: "contain",
  },
  seedCounter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C1946D",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  seedCounterDark: {
    backgroundColor: "#9FA7A2",
  },
  seedCounterImage: {
    width: 20,
    height: 20,
  },
  seedCountText: {
    marginLeft: 6,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1B5E20",
  },
  emptyContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ translateY: -60 }],
  },
  emptyImage: {
    width: 72,
    height: 72,
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
  rewardToast: {
    position: "absolute",
    top: 150,
    left: 50,
    right: 50,
    zIndex: 1700,
    elevation: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#d5e6c7",
    borderRadius: 999,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  rewardToastText: {
    marginLeft: 7,
    fontSize: 15,
    fontWeight: "500",
    color: "#464646",
  },
  rewardToastDark: {
    backgroundColor: "#475F4B",
  },
  rewardToastTextDark: {
    color: "#FFFFFF",
  },
  rewardToastImage: {
    width: 24,
    height: 24,
    resizeMode: "contain",
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
    maxHeight: "43%",
    backgroundColor: "rgba(246, 251, 245, 0.8)",
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
  focusCardDark: {
    backgroundColor: "rgba(71, 95, 75, 0.75)",
    borderColor: "#475F4B",
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
  focusHeaderDark: {
    borderBottomColor: "#5A6C60",
  },
  focusPlantName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1B5E20",
  },
  focusTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  focusPlantTag: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#B1D497",
    marginTop: 2,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  focusPlantTagDark: {
    backgroundColor: "#475f4b",
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
    maxHeight: 430,
  },
  focusDetailContent: {
    padding: 10,
    paddingBottom: 12,
  },
  plantInfoSection: {
    marginBottom: 10,
    paddingBottom: 10,
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
  infoValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inlineWaterButton: {
    borderRadius: 8,
    backgroundColor: "#D0E7EF",
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  inlineWaterButtonText: {
    color: "#444444",
    fontWeight: "700",
    fontSize: 12,
  },
  lifeWarning: {
    color: "#D32F2F",
  },
  extraSection: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(111, 168, 220, 0.9)",
    backgroundColor: "rgba(111, 168, 220, 0.10)",
  },
  sourcePostTouchArea: {
    alignSelf: "stretch",
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
    backgroundColor: "#6FAF7A",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  moveButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  deleteOnlyRow: {
    marginTop: 4,
  },
  deleteButton: {
    borderRadius: 10,
    backgroundColor: "#E07A7A",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  tripleActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  tripleActionButton: {
    flex: 1,
    marginLeft: 0,
    marginRight: 0,
    height: 40,
  },
  waterDropButton: {
    backgroundColor: "#D0E7EF",
    marginRight: 8,
  },
  fertilizerButton: {
    backgroundColor: "#D39B5E",
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
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  cameraControlButtonDark: {
    backgroundColor: "#475F4B",
  },
  textWhiteDark: {
    color: "#FFFFFF",
  },
});
