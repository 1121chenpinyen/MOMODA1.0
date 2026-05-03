import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
    Alert,
    Image,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface PublishDialogProps {
  visible: boolean;
  onClose: () => void;
  onPublish: (text: string, media: any) => void;
  isLoading?: boolean;
  userAvatar?: string;
}

export default function PublishDialog({
  visible,
  onClose,
  onPublish,
  isLoading = false,
  userAvatar,
}: PublishDialogProps) {
  const [postText, setPostText] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<any>(null);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("權限不足", "需要相簿權限才能選取照片");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        selectionLimit: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setSelectedMedia({
          url: asset.uri,
          type: "photo",
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        });
      }
    } catch (error: any) {
      const rawMessage =
        typeof error?.message === "string" ? error.message : "";
      const lowerMessage = rawMessage.toLowerCase();
      if (lowerMessage.includes("timed out")) {
        Alert.alert("選取逾時", "讀取媒體超時，請再試一次或改選較小檔案。");
      } else {
        Alert.alert("選取失敗", rawMessage || "發生未知錯誤，請稍後再試。");
      }
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("權限不足", "需要相簿權限才能選取影片");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.7,
        selectionLimit: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setSelectedMedia({
          url: asset.uri,
          type: "video",
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
          duration: asset.duration,
        });
      }
    } catch (error: any) {
      const rawMessage =
        typeof error?.message === "string" ? error.message : "";
      const lowerMessage = rawMessage.toLowerCase();
      if (lowerMessage.includes("timed out")) {
        Alert.alert("選取逾時", "讀取影片超時，請改選較短的影片再試一次。");
      } else {
        Alert.alert("選取失敗", rawMessage || "發生未知錯誤，請稍後再試。");
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("權限不足", "需要相機權限才能拍照");
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setSelectedMedia({
          url: asset.uri,
          type: "photo",
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        });
      }
    } catch (error: any) {
      const rawMessage =
        typeof error?.message === "string" ? error.message : "";
      Alert.alert("拍照失敗", rawMessage || "相機暫時不可用，請稍後重試。");
    }
  };

  const handlePublish = () => {
    if (!postText.trim() && !selectedMedia) {
      Alert.alert("請輸入內容或選擇照片/影片");
      return;
    }

    onPublish(postText, selectedMedia);
    resetForm();
  };

  const resetForm = () => {
    setPostText("");
    setSelectedMedia(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        {/* 頭部 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelBtn}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>發布新貼文</Text>
          <TouchableOpacity
            onPress={handlePublish}
            disabled={isLoading || (!postText.trim() && !selectedMedia)}
            style={[
              styles.publishBtn,
              (isLoading || (!postText.trim() && !selectedMedia)) &&
                styles.publishBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.publishBtnText,
                (isLoading || (!postText.trim() && !selectedMedia)) &&
                  styles.publishBtnTextDisabled,
              ]}
            >
              {isLoading ? "發布中..." : "發布"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 用戶信息 */}
          <View style={styles.userSection}>
            <Image
              source={
                userAvatar
                  ? { uri: userAvatar }
                  : require("../assets/avatar-placeholder.png")
              }
              style={styles.userAvatar}
            />
            <View>
              <Text style={styles.userName}>你</Text>
              <Text style={styles.userStatus}>現在線上</Text>
            </View>
          </View>

          {/* 輸入框 */}
          <TextInput
            style={styles.input}
            placeholder="說說你的想法..."
            placeholderTextColor="#999"
            value={postText}
            onChangeText={setPostText}
            multiline
            maxLength={500}
          />

          <View style={styles.charCounter}>
            <Text style={styles.charCountText}>{postText.length}/500</Text>
          </View>

          {/* 媒體預覽 */}
          {selectedMedia && (
            <View style={styles.mediaPreview}>
              {selectedMedia.type === "video" ? (
                <View style={[styles.previewImage, styles.videoPlaceholder]}>
                  <Ionicons name="videocam" size={42} color="#fff" />
                  <Text style={styles.videoPlaceholderText}>已選擇影片</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: selectedMedia.url }}
                  style={styles.previewImage}
                />
              )}
              {selectedMedia.type === "video" && (
                <View style={styles.videoIcon}>
                  <Ionicons name="play" size={40} color="#fff" />
                </View>
              )}
              <TouchableOpacity
                style={styles.removeMediaBtn}
                onPress={() => {
                  setSelectedMedia(null);
                }}
              >
                <Ionicons name="close-circle" size={28} color="#ff6b6b" />
              </TouchableOpacity>
            </View>
          )}

          {/* 添加媒體選項 */}
          {!selectedMedia && (
            <View style={styles.mediaOptions}>
              <Text style={styles.mediaLabel}>添加照片或影片</Text>
              <View style={styles.mediaButtonRow}>
                <TouchableOpacity style={styles.mediaBtn} onPress={takePhoto}>
                  <Ionicons name="camera" size={28} color="#a29add" />
                  <Text style={styles.mediaBtnText}>拍照</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mediaBtn} onPress={pickPhoto}>
                  <Ionicons name="image" size={28} color="#a29add" />
                  <Text style={styles.mediaBtnText}>照片</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mediaBtn} onPress={pickVideo}>
                  <Ionicons name="videocam" size={28} color="#a29add" />
                  <Text style={styles.mediaBtnText}>影片</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 情感標籤 */}
          <View style={styles.feelingSection}>
            <Text style={styles.feelingLabel}>你現在的心情</Text>
            <View style={styles.feelingGrid}>
              {["😊", "😢", "😂", "😍", "😡", "😴"].map((emoji, idx) => (
                <TouchableOpacity key={idx} style={styles.feelingBtn}>
                  <Text style={styles.feelingEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderColor: "#eee",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  cancelBtn: {
    fontSize: 16,
    color: "#666",
  },
  publishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#a29add",
    borderRadius: 20,
  },
  publishBtnDisabled: {
    backgroundColor: "#ddd",
  },
  publishBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  publishBtnTextDisabled: {
    color: "#999",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userSection: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#eee",
  },
  userName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  userStatus: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  input: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#333",
    maxHeight: 150,
    textAlignVertical: "top",
    minHeight: 100,
  },
  charCounter: {
    alignItems: "flex-end",
    marginTop: 8,
  },
  charCountText: {
    fontSize: 12,
    color: "#999",
  },
  mediaPreview: {
    marginVertical: 16,
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    resizeMode: "cover",
  },
  videoPlaceholder: {
    backgroundColor: "#1f1f1f",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlaceholderText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
  },
  videoIcon: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -20,
    marginLeft: -20,
  },
  removeMediaBtn: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  mediaOptions: {
    marginVertical: 16,
  },
  mediaLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  mediaButtonRow: {
    flexDirection: "row",
    gap: 12,
  },
  mediaBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#a29add",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  mediaBtnText: {
    fontSize: 14,
    color: "#a29add",
    fontWeight: "bold",
    marginTop: 8,
  },
  feelingSection: {
    marginVertical: 16,
    marginBottom: 24,
  },
  feelingLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  feelingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  feelingBtn: {
    width: "30%",
    paddingVertical: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    alignItems: "center",
  },
  feelingEmoji: {
    fontSize: 28,
  },
});
