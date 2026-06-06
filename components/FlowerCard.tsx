import { Image, StyleSheet, Text, View } from "react-native";
import {
  DEFAULT_PLANT_IMAGE_OFFSETS,
  DEFAULT_PLANT_IMAGE_SIZES,
  DEFAULT_PLANT_IMAGE_XOFFSETS,
} from "../constants/plantImageSizes";
import { getAssetForPlant, getFallbackEmoji } from "../utils/plantCatalog";

interface FlowerCardProps {
  plant: any;
  style?: any;
  /** optional array of six sizes (pixels) matching the asset order */
  imageSizes?: number[];
  /** optional array of six vertical offsets (px) to shift the image down */
  imageOffsets?: number[];
  /** optional array of six horizontal offsets (px). 負值往左 */
  imageXOffsets?: number[];
}

export default function FlowerCard({
  plant,
  style,
  imageSizes = DEFAULT_PLANT_IMAGE_SIZES,
  imageOffsets = DEFAULT_PLANT_IMAGE_OFFSETS,
  imageXOffsets = DEFAULT_PLANT_IMAGE_XOFFSETS,
}: FlowerCardProps) {
  const asset = getAssetForPlant(plant);

  // determine asset index using same logic as getAssetForPlant
  const rawIndex =
    typeof plant?.imageIndex === "number" ? plant.imageIndex : -1;
  const assetIndex = Math.max(0, Math.abs(rawIndex || -1) - 1);

  const sizeFromMap = Array.isArray(imageSizes)
    ? imageSizes[assetIndex]
    : undefined;

  const defaultSize = rawIndex === -1 ? 144 : 112;
  const imageSize = typeof sizeFromMap === "number" ? sizeFromMap : defaultSize;

  const imageStyle = [
    styles.plantImage,
    {
      width: imageSize,
      height: imageSize,
      marginBottom: 0,
      marginLeft: 0,
    },
  ];

  return (
    <View style={[styles.container, style]}>
      {asset ? (
        <Image source={asset} style={imageStyle} resizeMode="contain" />
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
    justifyContent: "flex-end",
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
