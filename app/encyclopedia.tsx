import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { PLANT_CATALOG } from "../utils/plantCatalog";
import { getGarden } from "../utils/storage";

export default function EncyclopediaScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [garden, setGarden] = useState<{ plants?: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadGarden = async () => {
      try {
        const gardenData = await getGarden();
        if (active) {
          setGarden(gardenData);
        }
      } catch (error) {
        console.error("載入圖鑑資料失敗:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadGarden();

    return () => {
      active = false;
    };
  }, []);

  const unlockedTypes = useMemo(() => {
    return new Set((garden?.plants || []).map((plant: any) => plant.type));
  }, [garden?.plants]);

  const columns = width >= 900 ? 3 : 2;
  const cardGap = 12;
  const cardWidth = (width - 32 - cardGap * (columns - 1)) / columns;

  const unlockedCount = PLANT_CATALOG.filter((item) =>
    unlockedTypes.has(item.type),
  ).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>圖鑑</Text>
          <Text style={styles.subtitle}>
            已解鎖 {unlockedCount} / {PLANT_CATALOG.length} 種植物
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <MaterialCommunityIcons name="close" size={22} color="#4E342E" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8D6E63" />
          <Text style={styles.loadingText}>讀取圖鑑中...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            {PLANT_CATALOG.map((plant) => {
              const unlocked = unlockedTypes.has(plant.type);
              return (
                <View
                  key={plant.type}
                  style={[styles.card, { width: cardWidth }]}
                >
                  <View
                    style={[
                      styles.imageFrame,
                      unlocked ? styles.unlockedFrame : styles.lockedFrame,
                    ]}
                  >
                    <Image
                      source={
                        unlocked ? plant.bloomImage : plant.silhouetteImage
                      }
                      style={[
                        styles.image,
                        unlocked ? styles.unlockedImage : styles.lockedImage,
                      ]}
                      resizeMode="contain"
                    />

                    {!unlocked && (
                      <View style={styles.lockBadge}>
                        <MaterialCommunityIcons
                          name="lock"
                          size={14}
                          color="#fff"
                        />
                        <Text style={styles.lockBadgeText}>未解鎖</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.plantName}>{plant.name}</Text>
                  <Text style={styles.plantState}>
                    {unlocked ? "已解鎖" : "尚未解鎖"}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5EFE6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(109, 76, 65, 0.12)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#4E342E",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#7A6A5F",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#7A6A5F",
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    marginBottom: 12,
    borderRadius: 20,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(109, 76, 65, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  imageFrame: {
    height: 170,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 10,
  },
  unlockedFrame: {
    backgroundColor: "#FFF8E7",
  },
  lockedFrame: {
    backgroundColor: "#ECE7E1",
  },
  image: {
    width: "88%",
    height: "88%",
  },
  unlockedImage: {
    opacity: 1,
  },
  lockedImage: {
    opacity: 0.9,
    tintColor: "#6F6A66",
  },
  lockBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(78, 52, 46, 0.82)",
  },
  lockBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  plantName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#4E342E",
  },
  plantState: {
    marginTop: 4,
    fontSize: 12,
    color: "#7A6A5F",
  },
});
