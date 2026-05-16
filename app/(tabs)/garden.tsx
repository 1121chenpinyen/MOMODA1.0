import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ImageBackground,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import FlowerCard from "../../components/FlowerCard";
import { getFallbackEmoji } from "../../utils/plantCatalog";
import {
  clearAllPlants,
  getGarden,
  initGarden,
  removePlant,
  updateGarden,
} from "../../utils/storage";

const backgroundImage = require("../../assets/background/background.png");

const { width, height } = Dimensions.get("window");

export default function GardenScreen() {
  const [garden, setGarden] = useState<{ seeds: number; plants: any[] } | null>(
    null,
  );
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const [plantModalVisible, setPlantModalVisible] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [gardenAreaHeight, setGardenAreaHeight] = useState<number>(height);

  // 植物位置追蹤
  const [plantPositions, setPlantPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  // plant positions 快取，用於 pan handlers
  const plantPositionsRef = useRef<Record<string, { x: number; y: number }>>(
    {},
  );
  // 追蹤哪些植物已經確定位置（無法再拖動）
  const [lockedPlants, setLockedPlants] = useState<Set<string>>(new Set());
  const dragStartPos = useRef<{
    x: number;
    y: number;
    pageX?: number;
    pageY?: number;
  }>({ x: 0, y: 0 });

  const mountedRef = useRef(true);

  // 加載花園數據
  const loadGarden = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      await initGarden();
      const gardenData = await getGarden();
      setGarden(gardenData);

      // 使用儲存的 positions（若存在），否則為新植物生成預設位置
      let positions: Record<string, { x: number; y: number }> =
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

      // 從植物資料還原鎖定狀態，避免重新刷新後又要確認一次
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

  // 聚焦時重新加載
  useFocusEffect(
    useCallback(() => {
      if (mountedRef.current) {
        loadGarden();
      }
      return () => {};
    }, [loadGarden]),
  );

  // 為每個植物設置 PanResponder（只有未鎖定的才能拖動）
  const createPanResponder = (plantId: string) => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => {
        // 每次都檢查最新的鎖定狀態，不依賴快取
        return !lockedPlants.has(plantId);
      },
      onMoveShouldSetPanResponder: () => {
        return !lockedPlants.has(plantId);
      },
      onPanResponderGrant: () => {
        if (lockedPlants.has(plantId)) return;
        const pos = plantPositions[plantId] || { x: 0, y: 0 };
        dragStartPos.current = { x: pos.x, y: pos.y };
      },
      onPanResponderMove: (evt: any) => {
        if (lockedPlants.has(plantId)) return;

        const { pageX, pageY } = evt.nativeEvent;
        const startPos = dragStartPos.current;

        // 需要記住初始觸控位置以計算偏移
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

        // 限制邊界
        const plantHeight = 120;
        const maxY = Math.max(20, gardenAreaHeight - plantHeight - 20);

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
        // 拖動完成：將位置儲存到 storage 的 garden.positions
        try {
          updateGarden({ positions: plantPositionsRef.current });
        } catch (e) {
          console.error("儲存植物位置失敗", e);
        }
      },
    });

    return responder;
  };

  // 鎖定植物位置
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
    <ImageBackground source={backgroundImage} style={styles.container}>
      {/* 頂部信息欄 */}
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

      {/* 空花園提示 */}
      {sortedPlants.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={styles.emptyText}>你的花園還是空的</Text>
          <Text style={styles.emptySubText}>
            發文後，對應的花朵會自動在花園長出來。
          </Text>
        </View>
      )}

      {/* 可拖動的花園區域 */}
      {sortedPlants.length > 0 && (
        <View
          style={styles.gardenArea}
          onLayout={(event) => {
            setGardenAreaHeight(event.nativeEvent.layout.height);
          }}
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
                    setSelectedPlant(plant);
                    setPlantModalVisible(true);
                  }
                }}
                activeOpacity={isLocked ? 0.7 : 1}
              >
                <View
                  style={styles.draggablePlant}
                  pointerEvents={isLocked ? "none" : "auto"}
                  {...(isLocked ? {} : (panResponder.panHandlers as any))}
                >
                  <FlowerCard plant={plant} />
                </View>

                {/* 未鎖定時顯示確認按鈕 */}
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

      {/* 植物詳情模態框 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={plantModalVisible}
        onRequestClose={() => setPlantModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedPlant && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedPlant.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TouchableOpacity
                      style={{ marginRight: 12 }}
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
                                setPlantModalVisible(false);
                                setSelectedPlant(null);
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
                        size={24}
                        color="#e53935"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setPlantModalVisible(false)}
                    >
                      <MaterialCommunityIcons
                        name="close"
                        size={28}
                        color="#333"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView style={styles.plantDetailContainer}>
                  <View style={styles.plantImageContainer}>
                    <Text style={styles.largeEmoji}>
                      {getFallbackEmoji(selectedPlant)}
                    </Text>
                  </View>

                  <View style={styles.plantInfoSection}>
                    <Text style={styles.infoLabel}>狀態</Text>
                    <Text style={styles.infoValue}>
                      {selectedPlant.repliesCount === 0
                        ? "種子"
                        : selectedPlant.repliesCount < 5
                          ? "幼苗"
                          : "花"}
                    </Text>
                  </View>

                  <View style={styles.plantInfoSection}>
                    <Text style={styles.infoLabel}>稀有度</Text>
                    <Text style={styles.infoValue}>{selectedPlant.rarity}</Text>
                  </View>

                  <View style={styles.plantInfoSection}>
                    <Text style={styles.infoLabel}>回覆數</Text>
                    <Text style={styles.infoValue}>
                      {selectedPlant.repliesCount}
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

                  <View style={{ padding: 16, alignItems: "center" }}>
                    <TouchableOpacity
                      style={styles.moveButton}
                      onPress={() => {
                        if (!selectedPlant) return;
                        // 解除鎖定以允許移動，然後關閉 modal
                        setLockedPlants((prev) => {
                          const s = new Set(prev);
                          s.delete(selectedPlant.id);
                          return s;
                        });
                        setPlantModalVisible(false);
                      }}
                    >
                      <Text style={styles.moveButtonText}>移動植物</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
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
  plantButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
  },
  clearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
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
  emptyPlantButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyPlantButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  gridContainer: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  gardenArea: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  plantContainer: {
    position: "absolute",
    width: 120,
    height: 120,
  },
  draggablePlant: {
    width: 120,
    height: 120,
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
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B5E20",
  },
  plantDetailContainer: {
    padding: 16,
  },
  plantImageContainer: {
    height: 200,
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  largeEmoji: {
    fontSize: 120,
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
  progressBar: {
    height: 8,
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    overflow: "hidden",
    marginVertical: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4CAF50",
  },
  progressText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
});
