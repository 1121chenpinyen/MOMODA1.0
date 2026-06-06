import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import PostDetailModal from "../../components/PostDetailModal";
import { db, storage } from "../../config/firebaseConfig";
import { getDeviceId } from "../../utils/getDeviceId";
import {
  getGarden,
  getGlobalData,
  growPlant,
  updateGlobalData
} from "../../utils/storage";

const { width } = Dimensions.get("window");

export default function ProfilePage() {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [editingId, setEditingId] = useState<boolean>(false);
  const [tempId, setTempId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [postDays, setPostDays] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<"posts" | "favorites">("posts");
  const [postViewMode, setPostViewMode] = useState<"time" | "calendar">("time");
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [favoritePosts, setFavoritePosts] = useState<any[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedPostDetail, setSelectedPostDetail] = useState<any | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, any>>({});
  
  // 留言相關狀態
  const [commentSortMode, setCommentSortMode] = useState<"new" | "likes">("new");
  const [commentText, setCommentText] = useState("");
  const [commentImage, setCommentImage] = useState<string | null>(null);

  // 數據統計狀態
  const [stats, setStats] = useState({
    sentPosts: 0,
    sentComments: 0,
    receivedComments: 0,
  });

  // 前一個值的追蹤
  const [prevStats, setPrevStats] = useState({
    sentPosts: 0,
    sentComments: 0,
    receivedComments: 0,
  });

  // 動畫值：控制translateY
  const sentPostsSlideAnim = useRef(new Animated.Value(0)).current;
  const sentCommentsSlideAnim = useRef(new Animated.Value(0)).current;
  const receivedCommentsSlideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  // 更新 profileMap，用於顯示貼文作者資訊
  useEffect(() => {
    if (myPosts.length === 0 && favoritePosts.length === 0) return;

    const allPosts = [...myPosts, ...favoritePosts];
    const authorIds = Array.from(
      new Set(
        allPosts
          .map((p) => p.authorId || p.deviceId)
          .filter((id) => id && id !== userId),
      ),
    );

    if (authorIds.length === 0) return;

    authorIds.forEach((authorId) => {
      if (authorId && !profileMap[authorId]) {
        getDoc(doc(collection(db, "profiles"), authorId as string)).then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setProfileMap((prev) => ({
              ...prev,
              [authorId as string]: {
                name: data.userId || "匿名小夥伴",
                avatar: data.avatarUrl || "",
              },
            }));
          }
        });
      }
    });
  }, [myPosts, favoritePosts, userId, profileMap]);

  // 當 stats 更新時，執行滑動動畫
  useEffect(() => {
    if (stats.sentPosts !== prevStats.sentPosts) {
      sentPostsSlideAnim.setValue(0);
      Animated.timing(sentPostsSlideAnim, {
        toValue: -40,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        sentPostsSlideAnim.setValue(0);
        setPrevStats((prev) => ({ ...prev, sentPosts: stats.sentPosts }));
      });
    }
  }, [stats.sentPosts, sentPostsSlideAnim]);

  useEffect(() => {
    if (stats.sentComments !== prevStats.sentComments) {
      sentCommentsSlideAnim.setValue(0);
      Animated.timing(sentCommentsSlideAnim, {
        toValue: -40,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        sentCommentsSlideAnim.setValue(0);
        setPrevStats((prev) => ({ ...prev, sentComments: stats.sentComments }));
      });
    }
  }, [stats.sentComments, sentCommentsSlideAnim]);

  useEffect(() => {
    if (stats.receivedComments !== prevStats.receivedComments) {
      receivedCommentsSlideAnim.setValue(0);
      Animated.timing(receivedCommentsSlideAnim, {
        toValue: -40,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        receivedCommentsSlideAnim.setValue(0);
        setPrevStats((prev) => ({
          ...prev,
          receivedComments: stats.receivedComments,
        }));
      });
    }
  }, [stats.receivedComments, receivedCommentsSlideAnim]);

  // 留言排序計算
  const sortedComments = useMemo(() => {
    const comments = [...(selectedPostDetail?.comments || [])];

    if (commentSortMode === "new") {
      comments.sort((a: any, b: any) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    }

    if (commentSortMode === "likes") {
      comments.sort((a: any, b: any) => {
        return (b.likes || 0) - (a.likes || 0);
      });
    }

    return comments;
  }, [selectedPostDetail?.comments, commentSortMode]);

  // 上傳留言圖片
  const uploadCommentImageAsync = async (uri: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();

    const fileName = `comments/${Date.now()}_comment.jpg`;
    const storageRef = ref(storage, fileName);

    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  // 拍照留言
  const takeCommentPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("權限不足", "需要相機權限才能拍照");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets?.[0]?.uri || (result as any).uri;
      if (uri) {
        setCommentImage(uri);
      }
    }
  };

  // 從相簿選擇留言圖片
  const pickCommentPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("權限不足", "需要相簿權限才能選取照片");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      quality: 0.7,
      selectionLimit: 1,
    });

    if (!result.canceled) {
      const uri = result.assets?.[0]?.uri || (result as any).uri;
      if (uri) {
        setCommentImage(uri);
      }
    }
  };

  // 留言按讚
  const handleLikeComment = async (commentId: string) => {
    if (!selectedPostDetail || !userId) return;

    const originalComment = (selectedPostDetail.comments || []).find(
      (c: any) => c.id === commentId,
    );
    const previouslyLiked = originalComment?.likedBy?.includes(userId);

    const updatedComments = (selectedPostDetail.comments || []).map((c: any) => {
      if (c.id !== commentId) return c;

      const likedBy = c.likedBy || [];
      const hasLiked = likedBy.includes(userId);
      const isNewAuthorLike =
        !hasLiked &&
        selectedPostDetail.authorId === userId &&
        c.userId !== userId;

      const nextComment = {
        ...c,
        likes: (c.likes || 0) + (hasLiked ? -1 : 1),
        likedBy: hasLiked
          ? likedBy.filter((id: string) => id !== userId)
          : [...likedBy, userId],
      };

      return nextComment;
    });

    try {
      let fertilizerRewardCreated = false;
      const likedComment = updatedComments.find((c: any) => c.id === commentId);
      const shouldCreateReward =
        likedComment &&
        selectedPostDetail.authorId === userId &&
        likedComment.userId !== userId &&
        !previouslyLiked &&
        !likedComment.fertilizerRewardClaimed &&
        (!Array.isArray(likedComment.fertilizerRewards) ||
          likedComment.fertilizerRewards.length === 0);

      const finalComments = shouldCreateReward
        ? updatedComments.map((comment: any) => {
            if (comment.id !== commentId) return comment;

            const existingRewards = Array.isArray(comment.fertilizerRewards)
              ? comment.fertilizerRewards
              : [];

            return {
              ...comment,
              fertilizerRewards: [
                ...existingRewards,
                {
                  id: `reward_${selectedPostDetail.id}_${commentId}_${Date.now()}`,
                  claimedBy: [],
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          })
        : updatedComments;

      await updateDoc(doc(db, "posts", selectedPostDetail.id), {
        comments: finalComments,
      });

      setSelectedPostDetail({
        ...selectedPostDetail,
        comments: finalComments,
      });
    } catch (e) {
      console.error(e);
      Alert.alert("錯誤", "留言按讚失敗");
    }
  };

  // 添加留言
  const handleAddComment = async () => {
    if (!selectedPostDetail) return;

    const trimmedText = commentText.trim();
    if (!trimmedText && !commentImage) {
      Alert.alert("請輸入留言或加上照片");
      return;
    }

    if (!userId) {
      Alert.alert("使用者資料尚未載入完成");
      return;
    }

    try {
      const oldComments = selectedPostDetail.comments || [];
      const postOwnerId =
        selectedPostDetail.authorId || selectedPostDetail.deviceId || null;

      let imageUrl: string | undefined;
      if (commentImage) {
        imageUrl = await uploadCommentImageAsync(commentImage);
      }

      const newComment = {
        id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: trimmedText,
        userId: userId,
        userName: "匿名小夥伴",
        userAvatar: avatar || "",
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        ...(imageUrl ? { imageUrl } : {}),
      };

      const updatedComments = [...oldComments, newComment];

      await updateDoc(doc(db, "posts", selectedPostDetail.id), {
        comments: arrayUnion(newComment),
      });

      try {
        const garden = await getGarden();

        // 自己留言自己的貼文：直接讓本機花園立刻成長
        if (postOwnerId && postOwnerId === userId) {
          for (const plant of garden.plants || []) {
            if (plant.postId === selectedPostDetail.id) {
              await growPlant(plant.id, 1);
            }
          }
        } else if (selectedPostDetail.id) {
          await updateDoc(doc(db, "posts", selectedPostDetail.id), {
            pendingGrowth: increment(1),
          });
        }

        // 回覆他人貼文時 +3 水滴
        const globalData = await getGlobalData();
        const newWaterDrops = (globalData.waterDrops || 0) + 3;
        await updateGlobalData({ waterDrops: newWaterDrops });
      } catch (gardenError) {
        console.error("更新花園成長失敗:", gardenError);
      }

      Keyboard.dismiss();
      setSelectedPostDetail({
        ...selectedPostDetail,
        comments: updatedComments,
      });

      setCommentText("");
      setCommentImage(null);
    } catch (error: any) {
      console.error("留言失敗:", error);
      Alert.alert("留言失敗", error?.message || "請稍後再試");
    }
  };

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
      let receivedComments = 0;
      const myPosts: any[] = [];
      const savedPosts: any[] = [];

      snapPosts.forEach((docSnap) => {
        const post = { id: docSnap.id, ...(docSnap.data() as any) };
        const isMyPost = post.authorId === id || post.deviceId === id;

        if (isMyPost) {
          sentPosts += 1;
          myPosts.push(post);
          // 計算他人在自己貼文上的留言數
          const comments = Array.isArray(post.comments) ? post.comments : [];
          comments.forEach((comment: any) => {
            if (comment.userId !== id) {
              receivedComments += 1;
            }
          });
        } else {
          // 如果不是自己的貼文，計算自己留言的次數
          const comments = Array.isArray(post.comments) ? post.comments : [];
          comments.forEach((comment: any) => {
            if (comment.userId === id) {
              sentComments += 1;
            }
          });
        }

        if (Array.isArray(post.savedBy) && post.savedBy.includes(id)) {
          savedPosts.push(post);
        }
      });

      setStats({
        sentPosts,
        sentComments,
        receivedComments,
      });
      setMyPosts(myPosts);
      setFavoritePosts(savedPosts);
      setPostDays(getPostDaysFromPosts(myPosts));
    } catch (e) {
      console.error("[Profile] Stats error:", e);
    }
  };

  const formatDayKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;

  const parsePostDate = (createdAt: any) => {
    if (!createdAt) return null;
    if (createdAt.toDate) return createdAt.toDate();
    if (typeof createdAt === "string") return new Date(createdAt);
    return new Date(createdAt);
  };

  const getPostDaysFromPosts = (posts: any[]) => {
    const days: Record<string, boolean> = {};
    posts.forEach((post) => {
      const createdAt = parsePostDate(post.createdAt);
      if (!createdAt) return;
      const key = formatDayKey(createdAt);
      days[key] = true;
    });
    return days;
  };

  const getMonthMatrix = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const matrix: Array<Array<number | null>> = [];
    const startWeekday = firstDay.getDay();
    let currentDay = 1 - startWeekday;

    while (currentDay <= lastDay.getDate()) {
      const week: Array<number | null> = [];
      for (let i = 0; i < 7; i += 1) {
        if (currentDay < 1 || currentDay > lastDay.getDate()) {
          week.push(null);
        } else {
          week.push(currentDay);
        }
        currentDay += 1;
      }
      matrix.push(week);
    }

    return matrix;
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

        {/* 數據卡片：貼文數、給出回覆、收到回覆 */}
        <View style={styles.statBox}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>貼文</Text>
            <View style={styles.statValueContainer}>
              <Animated.View
                style={[
                  styles.statValueWrapper,
                  { transform: [{ translateY: sentPostsSlideAnim }] },
                ]}
              >
                <Text style={styles.statValue}>{prevStats.sentPosts}</Text>
                <Text style={styles.statValue}>{stats.sentPosts}</Text>
              </Animated.View>
            </View>
        {/* 共用貼文詳情 Modal */}
        <PostDetailModal
          visible={detailVisible}
          post={selectedPostDetail}
          onClose={() => {
            setDetailVisible(false);
            setCommentText("");
            setCommentImage(null);
          }}
          profileMap={profileMap}
          sortedComments={sortedComments}
          commentSortMode={commentSortMode}
          onCommentSortChange={setCommentSortMode}
          onLikeComment={handleLikeComment}
          showCommentInput={true}
          renderCommentInput={() => (
            <>
              {commentImage ? (
                <View style={styles.commentImagePreviewContainer}>
                  <Image
                    source={{ uri: commentImage }}
                    style={styles.commentImagePreview}
                  />
                  <TouchableOpacity
                    style={styles.removeCommentImageBtn}
                    onPress={() => setCommentImage(null)}
                  >
                    <Ionicons name="close-circle" size={24} color="#ff6b6b" />
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.commentInputBar}>
                <View style={styles.commentInputActions}>
                  <TouchableOpacity
                    style={styles.commentActionBtn}
                    onPress={takeCommentPhoto}
                  >
                    <Ionicons name="camera" size={20} color="#7b70c9" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.commentActionBtn}
                    onPress={pickCommentPhoto}
                  >
                    <Ionicons name="image" size={20} color="#7b70c9" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.commentInputInPage}
                  placeholder="輸入你的留言..."
                  placeholderTextColor="#aaa"
                  value={commentText}
                  onChangeText={setCommentText}
                />

                <TouchableOpacity
                  style={styles.sendCommentBtn}
                  onPress={handleAddComment}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        />
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>給出回覆</Text>
            <View style={styles.statValueContainer}>
              <Animated.View
                style={[
                  styles.statValueWrapper,
                  { transform: [{ translateY: sentCommentsSlideAnim }] },
                ]}
              >
                <Text style={styles.statValue}>{prevStats.sentComments}</Text>
                <Text style={styles.statValue}>{stats.sentComments}</Text>
              </Animated.View>
            </View>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>收到回覆</Text>
            <View style={styles.statValueContainer}>
              <Animated.View
                style={[
                  styles.statValueWrapper,
                  { transform: [{ translateY: receivedCommentsSlideAnim }] },
                ]}
              >
                <Text style={styles.statValue}>{prevStats.receivedComments}</Text>
                <Text style={styles.statValue}>{stats.receivedComments}</Text>
              </Animated.View>
            </View>
          </View>
        </View>

        <View style={styles.sectionTabs}>
          <TouchableOpacity
            style={[
              styles.sectionTab,
              activeSection === "posts" && styles.sectionTabActive,
            ]}
            onPress={() => setActiveSection("posts")}
          >
            <Text
              style={[
                styles.sectionTabText,
                activeSection === "posts" && styles.sectionTabTextActive,
              ]}
            >
              貼文頁
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sectionTab,
              activeSection === "favorites" && styles.sectionTabActive,
            ]}
            onPress={() => setActiveSection("favorites")}
          >
            <Text
              style={[
                styles.sectionTabText,
                activeSection === "favorites" && styles.sectionTabTextActive,
              ]}
            >
              收藏頁
            </Text>
          </TouchableOpacity>
        </View>

        {activeSection === "posts" ? (
          <>
            <View style={styles.viewTabs}>
              <TouchableOpacity
                style={[
                  styles.viewTab,
                  postViewMode === "time" && styles.viewTabActive,
                ]}
                onPress={() => setPostViewMode("time")}
              >
                <Text
                  style={[
                    styles.viewTabText,
                    postViewMode === "time" && styles.viewTabTextActive,
                  ]}
                >
                  時間順序
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.viewTab,
                  postViewMode === "calendar" && styles.viewTabActive,
                ]}
                onPress={() => setPostViewMode("calendar")}
              >
                <Text
                  style={[
                    styles.viewTabText,
                    postViewMode === "calendar" && styles.viewTabTextActive,
                  ]}
                >
                  月曆
                </Text>
              </TouchableOpacity>
            </View>

            {postViewMode === "time" ? (
              <View style={styles.listCard}>
                {myPosts.length === 0 ? (
                    <Text style={styles.emptyText}>目前沒有貼文</Text>
                  ) : (
                    myPosts
                      .slice()
                      .sort((a, b) => {
                        const aDate = parsePostDate(a.createdAt) || new Date(0);
                        const bDate = parsePostDate(b.createdAt) || new Date(0);
                        return bDate.getTime() - aDate.getTime();
                      })
                      .map((post) => (
                        <TouchableOpacity
                          key={post.id}
                          style={styles.postRow}
                          onPress={() => {
                            setSelectedPostDetail(post);
                            setDetailVisible(true);
                          }}
                        >
                          <Text style={styles.postRowDate}>
                            {parsePostDate(post.createdAt)
                              ? parsePostDate(post.createdAt).toLocaleDateString("zh-TW", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                })
                              : "未知時間"}
                          </Text>
                          <Text style={styles.postRowContent} numberOfLines={2}>
                            {post.content || post.text || "(無內容)"}
                          </Text>
                        </TouchableOpacity>
                      ))
                  )}
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.listCard}>
            {favoritePosts.length === 0 ? (
              <Text style={styles.emptyText}>目前沒有收藏貼文</Text>
            ) : (
              favoritePosts
                .slice()
                .sort((a, b) => {
                  const aDate = parsePostDate(a.createdAt) || new Date(0);
                  const bDate = parsePostDate(b.createdAt) || new Date(0);
                  return bDate.getTime() - aDate.getTime();
                })
                .map((post) => (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.postRow}
                    onPress={() => {
                      setSelectedPostDetail(post);
                      setDetailVisible(true);
                    }}
                  >
                    <Text style={styles.postRowDate}>
                      {parsePostDate(post.createdAt)
                        ? parsePostDate(post.createdAt).toLocaleDateString("zh-TW", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "未知時間"}
                    </Text>
                    <Text style={styles.postRowContent} numberOfLines={2}>
                      {post.content || post.text || "(無內容)"}
                    </Text>
                  </TouchableOpacity>
                ))
            )}
          </View>
        )}

        {activeSection === "posts" && postViewMode === "calendar" ? (
          <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity
              onPress={() =>
                setCalendarMonth(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                )
              }
            >
              <MaterialIcons name="chevron-left" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.calendarTitle}>
              {calendarMonth.toLocaleDateString("zh-TW", {
                year: "numeric",
                month: "long",
              })}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setCalendarMonth(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                )
              }
            >
              <MaterialIcons name="chevron-right" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {['日', '一', '二', '三', '四', '五', '六'].map((label) => (
              <Text key={label} style={styles.weekdayText}>
                {label}
              </Text>
            ))}
          </View>

          {getMonthMatrix(calendarMonth).map((week, index) => (
            <View key={`week-${index}`} style={styles.weekRow}>
              {week.map((day, dayIndex) => {
                const dayKey =
                  day != null
                    ? formatDayKey(new Date(
                        calendarMonth.getFullYear(),
                        calendarMonth.getMonth(),
                        day,
                      ))
                    : "";
                const hasPost = day != null && postDays[dayKey];
                const today =
                  day != null &&
                  day === new Date().getDate() &&
                  calendarMonth.getMonth() === new Date().getMonth() &&
                  calendarMonth.getFullYear() === new Date().getFullYear();

                return (
                  <View key={`day-${dayIndex}`} style={styles.dayCell}>
                    {day ? (
                      <View style={styles.dayInner}>
                        <Text style={[styles.dayText, today && styles.todayDayText]}>
                          {day}
                        </Text>
                        {hasPost ? (
                          <Image
                            source={require("../../assets/plant/mood1/mood1-5.png")}
                            style={styles.moodIcon}
                          />
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.emptyDay} />
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        ) : null}
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
  statItem: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  statLabel: {
    fontSize: 13,
    color: "#333",
    fontWeight: "bold",
    marginBottom: 8,
  },
  statValueContainer: {
    height: 40,
    overflow: "hidden",
  },
  statValueWrapper: {
    height: 80,
    justifyContent: "space-around",
  },
  sectionTabs: {
    flexDirection: "row",
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#f6f2dd",
    marginBottom: 12,
    padding: 4,
    overflow: "hidden",
  },
  sectionTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
  },
  sectionTabActive: {
    backgroundColor: "#d1a07a",
  },
  sectionTabText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  sectionTabTextActive: {
    color: "#fff",
  },
  viewTabs: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 12,
  },
  viewTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#f6f2dd",
    marginRight: 8,
  },
  viewTabActive: {
    backgroundColor: "#d1a07a",
  },
  viewTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  viewTabTextActive: {
    color: "#fff",
  },
  listCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  postRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 12,
  },
  postRowDate: {
    fontSize: 12,
    color: "#999",
    marginBottom: 6,
  },
  postRowContent: {
    fontSize: 15,
    color: "#333",
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    paddingVertical: 24,
  },
  calendarCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: -16,
  },
  weekdayText: {
    width: (width - 50) / 7,
    textAlign: "center",
    color: "#999",
    fontSize: 12,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: -16,
  },
  dayCell: {
    width: (width - 50) / 7,
    minHeight: 50,
    alignItems: "center",
  },
  dayInner: {
    alignItems: "center",
  },
  dayText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 6,
  },
  todayDayText: {
    color: "#7b70c9",
    fontWeight: "700",
  },
  emptyDay: {
    width: (width - 50) / 7,
    height: 30,
  },
  moodIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  statValue: { fontSize: 32, color: "#d1a07a", fontWeight: "300" },
  commentInputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
  },
  commentInputActions: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  commentActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f4f2fb",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  commentImagePreviewContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    position: "relative",
  },
  commentImagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    resizeMode: "cover",
  },
  removeCommentImageBtn: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  commentInputInPage: {
    flex: 1,
    backgroundColor: "#f4f2fb",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
  },
  sendCommentBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#a29add",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
});
