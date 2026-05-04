import {
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import plantsData from "../data/plants.json";

const { width } = Dimensions.get("window");
const cardWidth = (width - 40) / 2;

interface FlowerCardProps {
  plant: any;
  onPress?: () => void;
}

export default function FlowerCard({ plant, onPress }: FlowerCardProps) {
  // 取得種子模板數據
  const seedTemplate = plantsData.find((p) => p.type === plant.type);

  if (!seedTemplate) {
    return null;
  }

  // 根據成長階段取得當前的植物圖片和名稱
  const currentStage =
    seedTemplate.stages[plant.growth] || seedTemplate.stages[0];
  const growthPercent = plant.repliesCount % 5;
  const nextGrowthAt = 5 - growthPercent;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* 植物圖片 */}
      <View style={styles.imageContainer}>
        <Image
          source={require("../assets/background/background.png")}
          style={styles.backgroundImage}
        />
        <Text style={styles.stageImage}>🌱</Text>
      </View>

      {/* 植物信息 */}
      <Text style={styles.name} numberOfLines={2}>
        {seedTemplate.name}
      </Text>

      <View style={styles.infoRow}>
        <Text style={styles.stage}>{currentStage.name}</Text>
        <Text style={styles.rarity}>{plant.rarity}</Text>
      </View>

      {/* 成長進度 */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${(plant.repliesCount % 5) * 20}%`,
                backgroundColor: plant.growth >= 5 ? "#FFD700" : "#4CAF50",
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {plant.repliesCount % 5}/{5}
        </Text>
      </View>

      {/* 成長階段 */}
      <View style={styles.levelContainer}>
        <Text style={styles.levelText}>
          第 {plant.growth + 1} 階段
          {plant.growth >= 5 && " 🌸"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    margin: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    borderWidth: 2,
    borderColor: "#4CAF50",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    height: 100,
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    overflow: "hidden",
  },
  backgroundImage: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0.3,
  },
  stageImage: {
    fontSize: 50,
    textAlign: "center",
  },
  name: {
    fontWeight: "700",
    fontSize: 14,
    color: "#1B5E20",
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stage: {
    fontSize: 12,
    color: "#558B2F",
    fontWeight: "600",
  },
  rarity: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#C8E6C9",
    color: "#2E7D32",
    fontWeight: "600",
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: "#E0E0E0",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4CAF50",
  },
  progressText: {
    fontSize: 10,
    color: "#666",
    textAlign: "center",
  },
  levelContainer: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  levelText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2E7D32",
    textAlign: "center",
  },
});
