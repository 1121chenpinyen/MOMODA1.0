import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    ImageBackground,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import FlowerCard from "../../components/FlowerCard";
import plantsData from "../../data/plants.json";
import { getDeviceId } from "../../utils/getDeviceId";
import { getGarden, initGarden, plantSeed } from "../../utils/storage";

const backgroundImage = require("../../assets/background/background.png");

const { width } = Dimensions.get("window");

export default function GardenScreen() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [garden, setGarden] = useState<{ seeds: number; plants: any[] } | null>(
    null,
  );
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const [plantModalVisible, setPlantModalVisible] = useState<boolean>(false);
  const [seedSelectorVisible, setSeedSelectorVisible] =
    useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const mountedRef = useRef(true);

  // 取得裝置 ID
  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  // 加載花園數據
  const loadGarden = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      await initGarden();
      const gardenData = await getGarden();
      setGarden(gardenData);
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

  // 種植種子
  const handlePlantSeed = async (seedType: string) => {
    try {
      const newPlant = await plantSeed(seedType);
      const updatedGarden = await getGarden();
      setGarden(updatedGarden);
      setSeedSelectorVisible(false);
      Alert.alert("成功", `已種植 ${newPlant.name}！`);
    } catch (error) {
      const msg = (error as any)?.message || String(error);
      Alert.alert("失敗", msg);
    }
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
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <ImageBackground source={backgroundImage} style={styles.container}>
      {/* 頂部信息欄 */}
      <View style={styles.topBar}>
        <View style={styles.seedCounter}>
          <MaterialCommunityIcons name="seed" size={24} color="#4CAF50" />
          <Text style={styles.seedCountText}>{garden.seeds}</Text>
        </View>
        <Text style={styles.title}>我的花園</Text>
        <TouchableOpacity
          style={styles.plantButton}
          onPress={() => setSeedSelectorVisible(true)}
          disabled={garden.seeds === 0}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 空花園提示 */}
      {sortedPlants.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={styles.emptyText}>你的花園還是空的</Text>
          <Text style={styles.emptySubText}>
            發布煩惱獲得種子，然後種植它們吧！
          </Text>
          {garden.seeds > 0 && (
            <TouchableOpacity
              style={styles.emptyPlantButton}
              onPress={() => setSeedSelectorVisible(true)}
            >
              <Text style={styles.emptyPlantButtonText}>開始種植</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 植物網格 */}
      {sortedPlants.length > 0 && (
        <FlatList
          data={sortedPlants}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item }) => (
            <FlowerCard
              plant={item}
              onPress={() => {
                setSelectedPlant(item);
                setPlantModalVisible(true);
              }}
            />
          )}
          scrollEnabled={false}
        />
      )}

      {/* 種子選擇模態框 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={seedSelectorVisible}
        onRequestClose={() => setSeedSelectorVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>選擇要種植的種子</Text>
              <TouchableOpacity onPress={() => setSeedSelectorVisible(false)}>
                <MaterialCommunityIcons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.seedList}>
              {plantsData.map((seed) => (
                <TouchableOpacity
                  key={seed.id}
                  style={styles.seedItem}
                  onPress={() => handlePlantSeed(seed.type)}
                >
                  <View style={styles.seedItemLeft}>
                    <Text style={styles.seedItemEmoji}>🌱</Text>
                    <View>
                      <Text style={styles.seedItemName}>{seed.name}</Text>
                      <Text style={styles.seedItemRarity}>
                        {seed.rarity === "common" && "普通"}
                        {seed.rarity === "uncommon" && "不常見"}
                        {seed.rarity === "rare" && "稀有"}
                      </Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color="#999"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                  <TouchableOpacity onPress={() => setPlantModalVisible(false)}>
                    <MaterialCommunityIcons
                      name="close"
                      size={28}
                      color="#333"
                    />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.plantDetailContainer}>
                  <View style={styles.plantImageContainer}>
                    <Text style={styles.largeEmoji}>🌱</Text>
                  </View>

                  <View style={styles.plantInfoSection}>
                    <Text style={styles.infoLabel}>稀有度</Text>
                    <Text style={styles.infoValue}>{selectedPlant.rarity}</Text>
                  </View>

                  <View style={styles.plantInfoSection}>
                    <Text style={styles.infoLabel}>成長階段</Text>
                    <Text style={styles.infoValue}>
                      {selectedPlant.growth + 1} / 6
                    </Text>
                  </View>

                  <View style={styles.plantInfoSection}>
                    <Text style={styles.infoLabel}>回覆數</Text>
                    <Text style={styles.infoValue}>
                      {selectedPlant.repliesCount}
                    </Text>
                  </View>

                  <View style={styles.plantInfoSection}>
                    <Text style={styles.infoLabel}>成長進度</Text>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${(selectedPlant.repliesCount % 5) * 20}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {selectedPlant.repliesCount % 5} / 5 回覆直到下一階段
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
    paddingVertical: 12,
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
  seedList: {
    padding: 16,
  },
  seedItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    marginBottom: 8,
  },
  seedItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  seedItemEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  seedItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  seedItemRarity: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
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
