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
    sentPosts: 0,
    sentComments: 0,
    receivedPostLikes: 0,
    receivedCommentLikes: 0,
  });

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  // 抓取統計數據邏輯 (符合 index 命名)
  const fetchUserStats = async (id: string) => {
    try {
      const qPosts = query(collection(db, "posts"));
      const snapPosts = await getDocs(qPosts);

      // 2. 舊版留言資料 (replies 集合中 fromDeviceId 是我的)
      const qMyReplies = query(
        collection(db, "replies"),
        where("fromDeviceId", "==", id),
      );
      const snapMyReplies = await getDocs(qMyReplies);

      let sentPosts = 0;
      let sentComments = snapMyReplies.size;
      let receivedPostLikes = 0;
      let receivedCommentLikes = 0;

      snapPosts.forEach((docSnap) => {
        const post = docSnap.data();
        const isMyPost = post.authorId === id || post.deviceId === id;

        if (isMyPost) {
          sentPosts += 1;
          receivedPostLikes += post.likes || 0;
        }

        const comments = Array.isArray(post.comments) ? post.comments : [];
        comments.forEach((comment: any) => {
          if (comment.userId === id) {
            sentComments += 1;
            receivedCommentLikes += comment.likes || 0;
          }
        });
      });

      setStats({
        sentPosts,
        sentComments,
        receivedPostLikes,
        receivedCommentLikes,
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
      // 確保 pendingFertilizers 欄位存在（若不存在則初始化為 0）
      try {
        const profileRef = doc(collection(db, "profiles"), deviceId);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          if (data.pendingFertilizers === undefined) {
            await setDoc(profileRef, { pendingFertilizers: 0 }, { merge: true });
          }
        } else {
          await setDoc(profileRef, { pendingFertilizers: 0 }, { merge: true });
        }
      } catch (e) {
        console.error("初始化 pendingFertilizers 失敗:", e);
      }

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
        try {
          const profileRef = doc(collection(db, "profiles"), deviceId);
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            const data = profileSnap.data();
            if (data.pendingFertilizers === undefined) {
              await setDoc(profileRef, { pendingFertilizers: 0 }, { merge: true });
            }
          } else {
            await setDoc(profileRef, { pendingFertilizers: 0 }, { merge: true });
          }
        } catch (e) {
          console.error("初始化 pendingFertilizers 失敗:", e);
        }

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
            <Text style={styles.statLabel}>發文數</Text>
            <Text style={styles.statValue}>{stats.sentPosts}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>留言數</Text>
            <Text style={styles.statValue}>{stats.sentComments}</Text>
          </View>
        </View>

        {/* 數據卡片 2：給出回覆 & 收到回覆 */}
        <View style={styles.statBox}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>收到貼文讚</Text>
            <Text style={styles.statValue}>{stats.receivedPostLikes}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>收到留言讚</Text>
            <Text style={styles.statValue}>{stats.receivedCommentLikes}</Text>
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
