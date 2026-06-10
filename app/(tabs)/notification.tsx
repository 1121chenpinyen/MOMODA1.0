import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PostDetailModal from "../../components/PostDetailModal";
import { db, storage } from "../../config/firebaseConfig";
import { getDeviceId } from "../../utils/getDeviceId";
import {
  getGarden,
  getGlobalData,
  updateGlobalData
} from "../../utils/storage";

const READ_NOTIFICATIONS_STORAGE_KEY = "read_notification_ids";

function formatTime(createdAt: any) {
  if (!createdAt) {
    return "剛剛";
  }

  const date = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) {
    return "剛剛";
  }

  if (diffMin < 60) {
    return `${diffMin} 分鐘前`;
  }

  if (diffHour < 24) {
    return `${diffHour} 小時前`;
  }

  if (diffDay < 7) {
    return `${diffDay} 天前`;
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getCreatedAtValue(createdAt: any) {
  if (!createdAt) {
    return 0;
  }

  if (createdAt?.toDate) {
    return createdAt.toDate().getTime();
  }

  const dateValue = new Date(createdAt).getTime();

  return Number.isNaN(dateValue) ? 0 : dateValue;
}

function getCommentId(postId: string, comment: any, index: number) {
  if (comment?.id) {
    return comment.id;
  }

  return `${postId}_${index}_${getCreatedAtValue(comment?.createdAt)}`;
}

function renderAvatar(avatar?: string, size: number = 44) {
  return (
    <Image
      source={
        avatar
          ? { uri: avatar }
          : require("../../assets/avatar-placeholder.png")
      }
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#f0f0f0",
      }}
    />
  );
}

export default function NotificationPage() {
  const [deviceId, setDeviceId] = useState<string>("");

  const [notifications, setNotifications] = useState<any[]>([]);

  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);

  const [selectedPost, setSelectedPost] = useState<any | null>(null);

  const [targetCommentId, setTargetCommentId] = useState<string | null>(null);

  const [detailVisible, setDetailVisible] = useState(false);

  const [commentSortMode, setCommentSortMode] = useState<"new" | "likes">(
    "new",
  );

  /*
    目前登入使用者資料：
    deviceId 用於辨識身分；
    name 和 avatar 用於顯示留言作者資訊。
  */
  const [currentUser, setCurrentUser] = useState({
    name: "匿名小夥伴",
    avatar: "",
  });

  /*
    留言輸入區塊狀態
  */
  const [commentText, setCommentText] = useState("");

  const [commentImage, setCommentImage] = useState<string | null>(null);

  /*
    防止使用者連續按下發送鍵：
    state 控制畫面的 Loading；
    ref 會在重新渲染前立刻鎖定。
  */
  const [isSendingComment, setIsSendingComment] = useState(false);

  const isSendingCommentRef = useRef(false);

  /*
    取得裝置 ID
  */
  useEffect(() => {
    getDeviceId().then((id) => {
      setDeviceId(id);
    });
  }, []);

  /*
    讀取目前使用者名稱與頭貼
  */
  useEffect(() => {
    if (!deviceId) {
      return;
    }

    const loadCurrentUser = async () => {
      try {
        const profileSnapshot = await getDoc(doc(db, "profiles", deviceId));

        if (!profileSnapshot.exists()) {
          return;
        }

        const data = profileSnapshot.data();

        setCurrentUser({
          name: data.userId || "匿名小夥伴",
          avatar: data.avatarUrl || "",
        });
      } catch (error) {
        console.error("讀取使用者資料失敗:", error);
      }
    };

    loadCurrentUser();
  }, [deviceId]);

  /*
    讀取通知已讀狀態
  */
  useEffect(() => {
    const loadReadNotificationIds = async () => {
      try {
        const storedIds = await AsyncStorage.getItem(
          READ_NOTIFICATIONS_STORAGE_KEY,
        );

        if (!storedIds) {
          return;
        }

        const parsedIds = JSON.parse(storedIds);

        if (Array.isArray(parsedIds)) {
          setReadNotificationIds(parsedIds);
        }
      } catch (error) {
        console.error("讀取通知已讀狀態失敗", error);
      }
    };

    loadReadNotificationIds();
  }, []);

  /*
    即時監聽自己的貼文：
    只顯示其他人在自己貼文留下的留言通知。
  */
  useEffect(() => {
    if (!deviceId) {
      return;
    }

    const postQuery = query(
      collection(db, "posts"),
      where("authorId", "==", deviceId),
    );

    const unsubscribe = onSnapshot(
      postQuery,
      (snapshot) => {
        const items: any[] = [];
        const latestPosts: any[] = [];

        snapshot.docs.forEach((document) => {
          const post = {
            id: document.id,
            ...document.data(),
          } as any;

          latestPosts.push(post);

          const comments = Array.isArray(post.comments) ? post.comments : [];

          comments.forEach((comment: any, index: number) => {
            /*
                自己在自己貼文留下的留言，
                不需要顯示成通知。
              */
            if (!comment || comment.userId === deviceId) {
              return;
            }

            const notificationId = getCommentId(document.id, comment, index);

            items.push({
              id: notificationId,
              post,
              comment: {
                ...comment,
                id: notificationId,
              },
            });
          });
        });

        items.sort((firstItem, secondItem) => {
          const firstTime = getCreatedAtValue(firstItem.comment.createdAt);

          const secondTime = getCreatedAtValue(secondItem.comment.createdAt);

          return secondTime - firstTime;
        });

        setNotifications(items);

        /*
          詳情畫面正在開啟時，
          持續同步 Firestore 最新資料。

          因此按讚、收藏、新增留言後，
          Modal 裡的數字與留言會立即更新。
        */
        setSelectedPost((previousPost: any | null) => {
          if (!previousPost) {
            return previousPost;
          }

          const latestPost = latestPosts.find(
            (post) => post.id === previousPost.id,
          );

          return latestPost || previousPost;
        });

        setLoading(false);
      },
      (error) => {
        console.error("通知頁面讀取失敗", error);

        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [deviceId]);

  /*
    留言排序
  */
  const sortedComments = useMemo(() => {
    const comments = [...(selectedPost?.comments || [])];

    if (commentSortMode === "new") {
      comments.sort((firstComment: any, secondComment: any) => {
        const firstTime = getCreatedAtValue(firstComment.createdAt);

        const secondTime = getCreatedAtValue(secondComment.createdAt);

        return secondTime - firstTime;
      });
    }

    if (commentSortMode === "likes") {
      comments.sort((firstComment: any, secondComment: any) => {
        return (secondComment.likes || 0) - (firstComment.likes || 0);
      });
    }

    return comments;
  }, [selectedPost?.comments, commentSortMode]);

  /*
    貼文按讚
  */
  const handleLikePost = async (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];

    const hasLiked = likedBy.includes(deviceId);

    try {
      await updateDoc(doc(db, "posts", post.id), {
        likes: increment(hasLiked ? -1 : 1),

        likedBy: hasLiked
          ? likedBy.filter((id: string) => id !== deviceId)
          : [...likedBy, deviceId],
      });
    } catch (error) {
      console.error("貼文按讚失敗:", error);

      Alert.alert("發生錯誤", "無法更新按讚");
    }
  };

  /*
    貼文收藏
  */
  const handleSavePost = async (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const savedBy = Array.isArray(post.savedBy) ? post.savedBy : [];

    const hasSaved = savedBy.includes(deviceId);

    try {
      await updateDoc(doc(db, "posts", post.id), {
        savedBy: hasSaved
          ? savedBy.filter((id: string) => id !== deviceId)
          : [...savedBy, deviceId],
      });
    } catch (error) {
      console.error("貼文收藏失敗:", error);

      Alert.alert("發生錯誤", "無法更新收藏");
    }
  };

  /*
    刪除自己的貼文
  */
  const handleDeletePost = (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const isOwnPost = post.authorId === deviceId || post.deviceId === deviceId;

    if (!isOwnPost) {
      Alert.alert("無法刪除", "你只能刪除自己發出的貼文");

      return;
    }

    Alert.alert("刪除貼文", "確定要刪除這則貼文嗎？", [
      {
        text: "取消",
        style: "cancel",
      },
      {
        text: "刪除",
        style: "destructive",

        onPress: async () => {
          try {
            await deleteDoc(doc(db, "posts", post.id));

            setDetailVisible(false);
            setSelectedPost(null);
            setTargetCommentId(null);
            setCommentText("");
            setCommentImage(null);

            Alert.alert("已刪除貼文");
          } catch (error) {
            console.error("刪除貼文失敗:", error);

            Alert.alert("刪除失敗", "請稍後再試");
          }
        },
      },
    ]);
  };

  /*
    留言按讚
  */
  const handleLikeComment = async (commentId: string) => {
    if (!selectedPost || !deviceId) {
      return;
    }

    const comments = Array.isArray(selectedPost.comments)
      ? selectedPost.comments
      : [];

    const updatedComments = comments.map((comment: any, index: number) => {
      const currentCommentId = getCommentId(selectedPost.id, comment, index);

      if (currentCommentId !== commentId) {
        return comment;
      }

      const likedBy = Array.isArray(comment.likedBy) ? comment.likedBy : [];

      const hasLiked = likedBy.includes(deviceId);

      return {
        ...comment,

        /*
            舊資料若沒有 id，
            順便補上穩定的 id。
          */
        id: currentCommentId,

        likes: Math.max(0, (comment.likes || 0) + (hasLiked ? -1 : 1)),

        likedBy: hasLiked
          ? likedBy.filter((id: string) => id !== deviceId)
          : [...likedBy, deviceId],
      };
    });

    try {
      await updateDoc(doc(db, "posts", selectedPost.id), {
        comments: updatedComments,
      });

      setSelectedPost({
        ...selectedPost,
        comments: updatedComments,
      });
    } catch (error) {
      console.error("留言按讚失敗:", error);

      Alert.alert("錯誤", "留言按讚失敗");
    }
  };

  /*
    上傳留言圖片
  */
  const uploadCommentImageAsync = async (uri: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();

    const fileName = `comments/${Date.now()}_comment.jpg`;

    const storageReference = ref(storage, fileName);

    await uploadBytes(storageReference, blob);

    return await getDownloadURL(storageReference);
  };

  /*
    使用相機拍攝留言圖片
  */
  const takeCommentPhoto = async () => {
    if (isSendingComment) {
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("權限不足", "需要相機權限才能拍照");

      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
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

  /*
    從相簿選擇留言圖片
  */
  const pickCommentPhoto = async () => {
    if (isSendingComment) {
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("權限不足", "需要相簿權限才能選取照片");

      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
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

  /*
    新增留言：
    發送期間會顯示 Loading，
    並鎖定輸入框、相機、相簿和發送鍵。
  */
  const handleAddComment = async () => {
    if (isSendingCommentRef.current) {
      return;
    }

    if (!selectedPost || !deviceId) {
      return;
    }

    const trimmedText = commentText.trim();

    if (!trimmedText && !commentImage) {
      Alert.alert("請輸入留言或加上照片");

      return;
    }

    isSendingCommentRef.current = true;
    setIsSendingComment(true);

    try {
      let imageUrl: string | undefined;

      if (commentImage) {
        imageUrl = await uploadCommentImageAsync(commentImage);
      }

      const newComment = {
        id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,

        text: trimmedText,
        userId: deviceId,
        userName: currentUser.name || "匿名小夥伴",

        userAvatar: currentUser.avatar || "",

        createdAt: new Date().toISOString(),

        likes: 0,
        likedBy: [],

        ...(imageUrl ? { imageUrl } : {}),
      };

      await updateDoc(doc(db, "posts", selectedPost.id), {
        comments: arrayUnion(newComment),
      });

      const updatedPost = {
        ...selectedPost,

        comments: [...(selectedPost.comments || []), newComment],
      };

      setSelectedPost(updatedPost);

      /*
        留言後同步處理花園成長與水滴獎勵，
        行為和首頁一致。
      */
      try {
        const postOwnerId =
          selectedPost.authorId || selectedPost.deviceId || null;

        const garden = await getGarden();

        if (postOwnerId && postOwnerId === deviceId) {
          // 自己回覆自己的貼文：不觸發植物成長，也不會給水滴
        } else if (selectedPost.id) {
          await updateDoc(doc(db, "posts", selectedPost.id), {
            pendingGrowth: increment(1),
          });

          const globalData = await getGlobalData();
          const newWaterDrops = (globalData.waterDrops || 0) + 3;
          await updateGlobalData({ waterDrops: newWaterDrops });
        }
      } catch (gardenError) {
        console.error("更新花園成長失敗:", gardenError);
      }

      Keyboard.dismiss();
      setCommentText("");
      setCommentImage(null);
    } catch (error: any) {
      console.error("留言失敗:", error);

      Alert.alert("留言失敗", error?.message || "請稍後再試");
    } finally {
      isSendingCommentRef.current = false;

      setIsSendingComment(false);
    }
  };

  /*
    將通知標示為已讀
  */
  const markNotificationAsRead = async (notificationId: string) => {
    if (readNotificationIds.includes(notificationId)) {
      return;
    }

    const updatedIds = [...readNotificationIds, notificationId];

    setReadNotificationIds(updatedIds);

    try {
      await AsyncStorage.setItem(
        READ_NOTIFICATIONS_STORAGE_KEY,
        JSON.stringify(updatedIds),
      );
    } catch (error) {
      console.error("儲存通知已讀狀態失敗", error);
    }
  };

  /*
    點擊通知後：
    1. 標示已讀
    2. 開啟貼文詳情
    3. 自動定位至指定留言
  */
  const openPostDetail = async (notificationId: string, post: any) => {
    await markNotificationAsRead(notificationId);

    setTargetCommentId(notificationId);
    setSelectedPost(post);
    setCommentText("");
    setCommentImage(null);
    setCommentSortMode("new");
    setDetailVisible(true);
  };

  /*
    關閉貼文詳情後回到通知頁
  */
  const closePostDetail = () => {
    setDetailVisible(false);
    setSelectedPost(null);
    setTargetCommentId(null);
    setCommentText("");
    setCommentImage(null);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>通知</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#B1D497" />

            <Text style={styles.loadingText}>讀取中...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>暫時沒有新的留言通知</Text>

            <Text style={styles.emptyText}>
              當你發出的貼文有新的留言時，這裡會顯示出來。
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {notifications.map((item) => {
              const isRead = readNotificationIds.includes(item.id);

              return (
                <Pressable
                  key={item.id}
                  style={[
                    styles.notificationCard,

                    isRead
                      ? styles.readNotificationCard
                      : styles.unreadNotificationCard,
                  ]}
                  onPress={() => {
                    openPostDetail(item.id, item.post);
                  }}
                >
                  <View style={styles.leftColumn}>
                    {renderAvatar(item.comment.userAvatar, 48)}
                  </View>

                  <View style={styles.bodyColumn}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.comment.userName || "匿名小夥伴"}
                      </Text>

                      <Text style={styles.commentLabel}> 留言：</Text>
                    </View>

                    <View style={styles.commentRow}>
                      <Text
                        style={styles.commentText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {item.comment.text || "(圖片)"}
                      </Text>

                      <Text style={styles.timeText}>
                        {formatTime(item.comment.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {item.comment.imageUrl ? (
                    <Image
                      source={{
                        uri: item.comment.imageUrl,
                      }}
                      style={styles.commentImage}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <PostDetailModal
          visible={detailVisible}
          post={selectedPost}
          targetCommentId={targetCommentId}
          onClose={closePostDetail}
          currentUserId={deviceId}
          onLikePost={handleLikePost}
          onSavePost={handleSavePost}
          onDeletePost={handleDeletePost}
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
                    source={{
                      uri: commentImage,
                    }}
                    style={styles.commentImagePreview}
                  />

                  <TouchableOpacity
                    style={styles.removeCommentImageBtn}
                    onPress={() => {
                      setCommentImage(null);
                    }}
                    disabled={isSendingComment}
                  >
                    <Ionicons
                      name="close-circle"
                      size={24}
                      color={isSendingComment ? "#bbbbbb" : "#ff6b6b"}
                    />
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.commentInputBar}>
                <View style={styles.commentInputActions}>
                  <TouchableOpacity
                    style={[
                      styles.commentActionBtn,

                      isSendingComment && styles.commentActionBtnDisabled,
                    ]}
                    onPress={takeCommentPhoto}
                    disabled={isSendingComment}
                  >
                    <Ionicons
                      name="camera"
                      size={20}
                      color={isSendingComment ? "#bbbbbb" : "#B1D497"}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.commentActionBtn,

                      isSendingComment && styles.commentActionBtnDisabled,
                    ]}
                    onPress={pickCommentPhoto}
                    disabled={isSendingComment}
                  >
                    <Ionicons
                      name="image"
                      size={20}
                      color={isSendingComment ? "#bbbbbb" : "#B1D497"}
                    />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[
                    styles.commentInputInPage,

                    isSendingComment && styles.commentInputDisabled,
                  ]}
                  placeholder={
                    isSendingComment ? "留言發送中..." : "輸入你的留言..."
                  }
                  placeholderTextColor="#aaaaaa"
                  value={commentText}
                  onChangeText={setCommentText}
                  editable={!isSendingComment}
                />

                <TouchableOpacity
                  style={[
                    styles.sendCommentBtn,

                    isSendingComment && styles.sendCommentBtnDisabled,
                  ]}
                  onPress={handleAddComment}
                  disabled={isSendingComment}
                >
                  {isSendingComment ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#ffffff" />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f5ff",
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: "#f7f5ff",
  },

  header: {
    width: "100%",
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },

  title: {
    width: "100%",
    fontSize: 28,
    fontWeight: "700",
    color: "#3b3256",
    textAlign: "center",
  },

  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 12,
    color: "#7f7d96",
  },

  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  emptyTitle: {
    marginBottom: 8,
    fontSize: 18,
    fontWeight: "700",
    color: "#6a5c9d",
    textAlign: "center",
  },

  emptyText: {
    fontSize: 14,
    color: "#8f8a9d",
    textAlign: "center",
    lineHeight: 20,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 16,
  },

  notificationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 12,
    borderRadius: 18,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },

  unreadNotificationCard: {
    backgroundColor: "#F0F4EC",
  },

  readNotificationCard: {
    backgroundColor: "#ffffff",
  },

  leftColumn: {
    marginRight: 12,
  },

  bodyColumn: {
    flex: 1,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  userName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#2e2640",
  },

  commentLabel: {
    flexShrink: 0,
    fontSize: 15,
    fontWeight: "400",
    color: "#4f4a66",
  },

  commentRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  commentText: {
    flex: 1,
    marginRight: 8,
    fontSize: 14,
    color: "#4f4a66",
    lineHeight: 20,
  },

  timeText: {
    flexShrink: 0,
    fontSize: 12,
    color: "#9e98b2",
  },

  commentImage: {
    width: 56,
    height: 56,
    marginLeft: 12,
    borderRadius: 12,
    resizeMode: "cover",
  },

  /*
    貼文詳情底部留言輸入區
  */
  commentInputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderTopWidth: 0.5,
    borderTopColor: "#eeeeee",
  },

  commentInputActions: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },

  commentActionBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: "#F0F4EC",
    borderRadius: 21,
  },

  commentActionBtnDisabled: {
    backgroundColor: "#eeeeee",
  },

  commentImagePreviewContainer: {
    position: "relative",
    marginHorizontal: 16,
    marginBottom: 12,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F0F4EC",
    borderRadius: 22,
    fontSize: 14,
    color: "#333333",
  },

  commentInputDisabled: {
    backgroundColor: "#eeeeee",
    color: "#999999",
  },

  sendCommentBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    backgroundColor: "#B1D497",
    borderRadius: 21,
  },

  sendCommentBtnDisabled: {
    backgroundColor: "#c9c5dd",
  },
});
