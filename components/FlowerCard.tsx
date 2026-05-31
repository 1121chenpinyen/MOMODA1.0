import { Image, StyleSheet, Text, View } from "react-native";
import { getAssetForPlant, getFallbackEmoji } from "../utils/plantCatalog";

interface FlowerCardProps {
  plant: any;
  style?: any;
}

export default function FlowerCard({ plant, style }: FlowerCardProps) {
  const asset = getAssetForPlant(plant);
  const imageIndex =
    typeof plant?.imageIndex === "number" ? plant.imageIndex : -1;
  const isSeedStage = imageIndex === -1;
  const imageSize = isSeedStage ? 144 : 112;
  const imageStyle = [
    styles.plantImage,
    {
      width: imageSize,
      height: imageSize,
    },
  ];

  return (
    <View style={[styles.container, style]}>
      {asset ? (
        <Image
          source={asset}
          style={imageStyle}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.emoji}>{getFallbackEmoji(plant)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 0,
  },
  plantImage: {
    borderWidth: 3,
    borderColor: "#a29add",
    borderRadius: 18,
    overflow: "hidden",
  },
  emoji: {
    fontSize: 50,
    textAlign: "center",
  },
});
