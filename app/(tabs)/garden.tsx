import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import { getUserId } from "../../utils/getUserId";
import { getFallbackEmoji } from "../../utils/plantCatalog";
import {
  claimPendingFertilizers,
  clearAllPlants,
  getGarden,
  getGlobalData,
  getPlantRemainingLife,
  initGarden,
  isPlantDead,
  removePlant,
  updateGarden,
  updateGlobalData,
} from "../../utils/storage";

const backgroundImage = require("../../assets/background/background.png");

const { width, height } = Dimensions.get("window");
const PLANT_SIZE = 120;

export default function GardenScreen() {
  const [garden, setGarden] = useState<{ seeds: number; plants: any[] } | null>(
    null,
  );
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const [plantFocusVisible, setPlantFocusVisible] = useState<boolean>(false);
  const [focusedPost, setFocusedPost] = useState<any | null>(null);
  const [loadingPost, setLoadingPost] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [gardenAreaHeight, setGardenAreaHeight] = useState<number>(height);
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

  const [plantPositions, setPlantPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const plantPositionsRef = useRef<Record<string, { x: number; y: number }>>(
    {},
  );
  const [lockedPlants, setLockedPlants] = useState<Set<string>>(new Set());
  const dragStartPos = useRef<{
    x: number;
    y: number;
    pageX?: number;
    pageY?: number;
  }>({ x: 0, y: 0 });
  const mountedRef = useRef(true);

  const loadGarden = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      await initGarden();
      const gardenData = await getGarden();
      const globalData = await getGlobalData();

      // 領取待處理的施肥
      const userId = await getUserId();
      if (userId) {
        const claimedFertilizers = await claimPendingFertilizers(userId);
        if (claimedFertilizers > 0) {
          const updatedGlobalData = await getGlobalData();
          setFertilizers(updatedGlobalData.fertilizers || 0);
        } else {
          setFertilizers(globalData.fertilizers || 0);
        }
      } else {
        setFertilizers(globalData.fertilizers || 0);
      }

      setGarden(gardenData);
      setWaterDrops(globalData.waterDrops || 0);

      const positions: Record<string, { x: number; y: number }> =
        gardenData.positions || {};

      gardenData.plants?.forEach((plant: any, index: number) => {
        if (!positions[plant.id]) {
          positions[plant.id] = {
            x: (index % 2) * (width / 2) + 40,
            y: Math.floor(index / 2) * 100 + 200,
          };
        }
      });

      setPlantPositions(positions);
      plantPositionsRef.current = positions;

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
  }, []);

  useEffect(() => {
    loadGarden();
  }, [loadGarden]);

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

  const createPanResponder = (plantId: string) => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => !lockedPlants.has(plantId),
      onMoveShouldSetPanResponder: () => !lockedPlants.has(plantId),
      onPanResponderGrant: () => {
        if (lockedPlants.has(plantId)) return;
        const pos = plantPositions[plantId] || { x: 0, y: 0 };
        dragStartPos.current = { x: pos.x, y: pos.y };
      },
      onPanResponderMove: (evt: any) => {
        if (lockedPlants.has(plantId)) return;

        const { pageX, pageY } = evt.nativeEvent;
        const startPos = dragStartPos.current;

        if (!dragStartPos.current.pageX) {
          dragStartPos.current.pageX = pageX;
          dragStartPos.current.pageY = pageY;
          return;
        }

        const dx = pageX - (dragStartPos.current.pageX || 0);
        const dy = pageY - (dragStartPos.current.pageY || 0);

        const newPos = {
          x: startPos.x + dx,
          y: startPos.y + dy,
        };

        const maxY = Math.max(20, gardenAreaHeight - PLANT_SIZE - 20);

        newPos.x = Math.max(-30, Math.min(newPos.x, width - 95));
        newPos.y = Math.max(-50, Math.min(newPos.y, maxY));

        setPlantPositions((prev) => {
          const next = {
            ...prev,
            [plantId]: newPos,
          };
          plantPositionsRef.current = next;
          return next;
        });
      },
      onPanResponderRelease: () => {
        try {
          updateGarden({ positions: plantPositionsRef.current });
        } catch (e) {
          console.error("儲存植物位置失敗", e);
        }
      },
    });

    return responder;
  };

  const handleLockPlant = async (plantId: string) => {
    if (!garden) return;

    const updatedPlants = (garden.plants || []).map((plant: any) =>
      plant.id === plantId ? { ...plant, locked: true } : plant,
    );

    setGarden({ ...garden, plants: updatedPlants });
    await updateGarden({
      ...garden,
      plants: updatedPlants,
      positions: plantPositionsRef.current,
    });

    setLockedPlants((prev) => new Set(prev).add(plantId));
  };

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
      const updatedPlants = (garden.plants || []).map((plant: any) =>
        plant.id === selectedPlant.id ? { ...plant, repliesCount: 4 } : plant,
      );

      setGarden({ ...garden, plants: updatedPlants });
      setSelectedPlant({
        ...selectedPlant,
        repliesCount: 4,
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
        `已施肥！植物已成長到最終型態\n剩餘施肥: ${newFertilizers}`,
      );
    } catch (e) {
      console.error("施肥失敗", e);
      Alert.alert("錯誤", "施肥失敗");
    }
  };

  const getPlantStage = (plant: any) => {
    if (plant.repliesCount === 0) return "種子";
    if (plant.repliesCount < 5) return "幼苗";
    return "花";
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

    const timeline = [
      `播種完成：${new Date(plant.createdAt).toLocaleDateString("zh-TW")}`,
      `目前階段：${stage}（累積 ${replies} 則回覆）`,
    ];

    if (replies < 5) {
      timeline.push(`下一階段還差 ${5 - replies} 則回覆`);
    } else {
      const flowerTier = Math.ceil(replies / 5);
      timeline.push(`開花進度：第 ${flowerTier} 次成長波段`);
    }

    return timeline;
  };

  const runOpenFocusAnimation = useCallback(
    (plant: any) => {
      const pos = plantPositionsRef.current[plant.id] || { x: 0, y: 0 };
      const sourceCenter = {
        x: pos.x + PLANT_SIZE / 2,
        y: pos.y + PLANT_SIZE / 2,
      };

      const zoom = width >= 900 ? 2.05 : 5.35;
      const targetCenter = {
        x: width / 2,
        y: height / 2 - 50,
      };

      const translateX = zoom * (targetCenter.x - sourceCenter.x);
      const translateY = zoom * (targetCenter.y - sourceCenter.y);

      setSelectedPlant(plant);
      setFocusedPost(null);
      setPlantFocusVisible(true);

      overlayOpacity.setValue(0);
      zoomTranslateX.setValue(0);
      zoomTranslateY.setValue(0);
      zoomScale.setValue(1);
      focusCardOpacity.setValue(0);
      focusCardScale.setValue(0.96);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(zoomTranslateX, {
          toValue: translateX,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(zoomTranslateY, {
          toValue: translateY,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(zoomScale, {
          toValue: zoom,
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
      ]).start();
    },
    [
      focusCardOpacity,
      focusCardScale,
      overlayOpacity,
      zoomScale,
      zoomTranslateX,
      zoomTranslateY,
    ],
  );

  const closeFocusPanel = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
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
      setPlantFocusVisible(false);
      setSelectedPlant(null);
      setFocusedPost(null);
    });
  }, [
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

      <ImageBackground
        source={backgroundImage}
        style={styles.sceneBackground}
      />

      <Animated.View
        style={[
          styles.sceneTranslateLayer,
          plantFocusVisible && {
            transform: [
              { translateX: zoomTranslateX },
              { translateY: zoomTranslateY },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.sceneScaleLayer,
            plantFocusVisible && { transform: [{ scale: zoomScale }] },
          ]}
        >
          {sortedPlants.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={styles.emptyText}>你的花園還是空的</Text>
              <Text style={styles.emptySubText}>
                發文後，對應的花朵會自動在花園長出來。
              </Text>
            </View>
          )}

          {sortedPlants.length > 0 && (
            <View
              style={styles.gardenArea}
              pointerEvents={plantFocusVisible ? "none" : "auto"}
            >
              {sortedPlants.map((plant, index) => {
                const pos = plantPositions[plant.id] || { x: 0, y: 0 };
                const panResponder = createPanResponder(plant.id);
                const isLocked = lockedPlants.has(plant.id);

                return (
                  <TouchableOpacity
                    key={plant.id}
                    style={[
                      styles.plantContainer,
                      {
                        left: pos.x,
                        top: pos.y,
                        zIndex: index,
                      },
                    ]}
                    onPress={() => {
                      if (isLocked) {
                        runOpenFocusAnimation(plant);
                      }
                    }}
                    activeOpacity={1}
                  >
                    <View
                      style={styles.draggablePlant}
                      pointerEvents={isLocked ? "none" : "auto"}
                      {...(isLocked ? {} : (panResponder.panHandlers as any))}
                    >
                      <FlowerCard plant={plant} />
                    </View>

                    {!isLocked && (
                      <TouchableOpacity
                        style={styles.confirmButton}
                        onPress={() => handleLockPlant(plant.id)}
                      >
                        <MaterialCommunityIcons
                          name="check"
                          size={16}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Animated.View>
      </Animated.View>

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
                    onPress={() => {
                      if (!selectedPlant) return;
                      setLockedPlants((prev) => {
                        const s = new Set(prev);
                        s.delete(selectedPlant.id);
                        return s;
                      });
                      closeFocusPanel();
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
                            setLoading(true);
                            try {
                              await removePlant(selectedPlant.id);
                              await loadGarden();
                              closeFocusPanel();
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
                      澆水 ({waterDrops})
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
                      施肥 ({fertilizers})
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
  sceneContainer: {
    flex: 1,
  },
  sceneTranslateLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sceneScaleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  plantContainer: {
    position: "absolute",
    width: PLANT_SIZE,
    height: PLANT_SIZE,
  },
  draggablePlant: {
    width: PLANT_SIZE,
    height: PLANT_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButton: {
    position: "absolute",
    bottom: -15,
    right: -15,
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
    elevation: 4,
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
    maxHeight: "40%",
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
    maxHeight: 280,
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
});
