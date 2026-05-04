import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Keyboard,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { db, storage } from "../../config/firebaseConfig";
import { getDeviceId } from "../../utils/getDeviceId";

const { width } = Dimensions.get("window");

export default function ProfilePage() {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [editingId, setEditingId] = useState<boolean>(false);
  const [tempId, setTempId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // 數據統計狀態
  const [stats, setStats] = useState({
    sentMessages: 20, // 我的小煩惱 (chat count)
    receivedHearts: 10, // 收到的愛心 (total likes on my replies)
    sentReplies: 0, // 給出的回覆 (replies I sent)
    receivedReplies: 20, // 收到的回覆 (replies to my messages)
  });

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  // 抓取統計數據邏輯 (符合 index 命名)
  const fetchUserStats = async (id: string) => {
    try {
      // 1. 我的小煩惱 (chat 集合中 deviceId 是我的)
      const qMsg = query(collection(db, "chat"), where("deviceId", "==", id));
      const snapMsg = await getDocs(qMsg);

      // 2. 給出的回覆 (replies 集合中 fromDeviceId 是我的)
      const qMyReplies = query(
        collection(db, "replies"),
        where("fromDeviceId", "==", id),
      );
      const snapMyReplies = await getDocs(qMyReplies);

      // 3. 收到的回覆 (replies 集合中 toDeviceId 是我的)
      const qReceivedReplies = query(
        collection(db, "replies"),
        where("toDeviceId", "==", id),
      );
      const snapReceivedReplies = await getDocs(qReceivedReplies);

      // 4. 收到的愛心 (計算自己發出的 reply 獲得的 likedBy 總數)
      let totalHearts = 0;
      snapMyReplies.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.likedBy && Array.isArray(data.likedBy)) {
          totalHearts += data.likedBy.length;
        }
      });

      setStats({
        sentMessages: snapMsg.size,
        receivedHearts: totalHearts,
        sentReplies: snapMyReplies.size,
        receivedReplies: snapReceivedReplies.size,
      });
    } catch (e) {
      console.error("[Profile] Stats error:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!deviceId) return;

      const updateData = async () => {
        try {
          const docRef = doc(collection(db, "profiles"), deviceId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.avatarUrl) setAvatar(data.avatarUrl);

            const localId = await AsyncStorage.getItem("userId");
            const finalId = data.userId || localId || deviceId;
            setUserId(finalId);
            setTempId(finalId);
          }

          // 每次切換回來都會跑這行，確保數據更新
          await fetchUserStats(deviceId);
        } catch (e) {
          console.error("刷新資料失敗:", e);
        } finally {
          setLoading(false);
        }
      };

      updateData();
    }, [deviceId]),
  );

  const uploadAvatar = async (uri: string) => {
    if (!deviceId) return;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `avatars/${deviceId}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await setDoc(
        doc(collection(db, "profiles"), deviceId),
        { avatarUrl: url },
        { merge: true },
      );
      setAvatar(url);
      Alert.alert("更新成功");
    } catch (e) {
      Alert.alert("上傳失敗");
    }
  };

  const handleEditAvatar = () => {
    Alert.alert("更換頭像", "選擇照片來源", [
      {
        text: "相簿",
        onPress: async () => {
          let result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
          });
          if (!result.canceled) uploadAvatar(result.assets[0].uri);
        },
      },
      { text: "取消", style: "cancel" },
    ]);
  };

  const saveId = async (newId: string) => {
    if (newId.trim().length === 0) return;
    setUserId(newId);
    setEditingId(false);
    try {
      await AsyncStorage.setItem("userId", newId);
      if (deviceId) {
        await setDoc(
          doc(collection(db, "profiles"), deviceId),
          { userId: newId },
          { merge: true },
        );
      }
    } catch (e) {
      console.log(e);
    }
    Keyboard.dismiss();
  };

  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4630EB" />
      </View>
    );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={styles.topSection} />

      <View style={styles.contentCard}>
        {/* 頭像區域 */}
        <View style={styles.avatarWrapper}>
          <Image
            source={
              avatar
                ? { uri: avatar }
                : require("../../assets/avatar-placeholder.png")
            }
            style={styles.avatarImage}
          />
          <TouchableOpacity
            style={styles.avatarEditIcon}
            onPress={handleEditAvatar}
          >
            <MaterialIcons name="edit" size={14} color="#666" />
          </TouchableOpacity>
        </View>

        {/* 使用者名稱區域 - 完美置中配置 */}
        <View style={styles.nameRow}>
          {/* 左側佔位塊：寬度與右側按鈕一致，確保中間文字置中 */}
          <View style={{ width: 40 }} />

          <View style={styles.centerNameArea}>
            {editingId ? (
              <TextInput
                style={styles.nameInput}
                value={tempId}
                onChangeText={setTempId}
                onBlur={() => saveId(tempId)}
                autoFocus
              />
            ) : (
              <Text style={styles.nameText}>{userId}</Text>
            )}
          </View>

          {/* 右側編輯按鈕：固定寬度 */}
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setEditingId(true)}
          >
            <MaterialIcons name="edit" size={18} color="#999" />
          </TouchableOpacity>
        </View>

        {/* 數據卡片 1：小煩惱 & 愛心 */}
        <View style={styles.statBox}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>我的小煩惱</Text>
            <Text style={styles.statValue}>{stats.sentMessages}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>收到的愛心</Text>
            <Text style={styles.statValue}>{stats.receivedHearts}</Text>
          </View>
        </View>

        {/* 數據卡片 2：給出回覆 & 收到回覆 */}
        <View style={styles.statBox}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>給出的回覆</Text>
            <Text style={styles.statValue}>{stats.sentReplies}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>收到的回覆</Text>
            <Text style={styles.statValue}>{stats.receivedReplies}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf9e1" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  topSection: { height: 200 },
  contentCard: {
    flex: 1,
    backgroundColor: "#e6e6e6",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 25,
    // Android 專用
    elevation: 10,

    // iOS 專用
    shadowColor: "#000",
    shadowOffset: {
      width: 0, // 設為 0 讓陰影不左右偏移
      height: 0, // 設為 0 讓陰影不上下偏移
    },
    shadowOpacity: 0.2, // 陰影透明度
    shadowRadius: 10,
  },
  avatarWrapper: {
    position: "absolute",
    top: -55,
    backgroundColor: "#fff",
    borderRadius: 60,
    padding: 3,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  avatarImage: { width: 110, height: 110, borderRadius: 55 },
  avatarEditIcon: {
    position: "absolute",
    right: 5,
    bottom: 5,
    backgroundColor: "#eee",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginBottom: 45,
  },
  centerNameArea: { flex: 1, alignItems: "center" },
  nameText: { fontSize: 20, fontWeight: "bold", color: "#333" },
  nameInput: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    borderBottomWidth: 1,
    width: 100,
    textAlign: "center",
  },
  editButton: { width: 40, alignItems: "center", justifyContent: "center" },

  statBox: {
    flexDirection: "row",
    backgroundColor: "#fff",
    width: "100%",
    borderRadius: 20,
    paddingVertical: 20,
    marginBottom: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  statItem: { flex: 1, paddingLeft: 25 },
  statLabel: {
    fontSize: 14,
    color: "#333",
    fontWeight: "bold",
    marginBottom: 10,
  },
  statValue: { fontSize: 32, color: "#d1a07a", fontWeight: "300" },
});
