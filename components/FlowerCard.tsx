import { Image, StyleSheet, Text, View } from "react-native";
import { getAssetForPlant, getFallbackEmoji } from "../utils/plantCatalog";

interface FlowerCardProps {
  plant: any;
  style?: any;
}

export default function FlowerCard({ plant, style }: FlowerCardProps) {
  const asset = getAssetForPlant(plant);

  return (
    <View style={[styles.container, style]}>
      {asset ? (
        <Image
          source={asset}
          style={{ width: 80, height: 80 }}
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
  emoji: {
    fontSize: 50,
    textAlign: "center",
  },
});
