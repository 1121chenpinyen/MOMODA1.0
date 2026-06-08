import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PostDetailModal from "../../components/PostDetailModal";
import { db } from "../../config/firebaseConfig";
import { getDeviceId } from "../../utils/getDeviceId";

const READ_NOTIFICATIONS_STORAGE_KEY = "read_notification_ids";

function formatTime(createdAt: any) {
  if (!createdAt) {
    return "剛剛";
  }

  const date = createdAt?.toDate
    ? createdAt.toDate()
    : new Date(createdAt);

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

  const [commentSortMode, setCommentSortMode] =
    useState<"new" | "likes">("new");

  useEffect(() => {
    getDeviceId().then((id) => {
      setDeviceId(id);
    });
  }, []);

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

          const comments = Array.isArray(post.comments)
            ? post.comments
            : [];

          comments.forEach((comment: any, index: number) => {
            if (!comment || comment.userId === deviceId) {
              return;
            }

            const notificationId = getCommentId(
              document.id,
              comment,
              index,
            );

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

        items.sort((a, b) => {
          const aTime = getCreatedAtValue(a.comment.createdAt);
          const bTime = getCreatedAtValue(b.comment.createdAt);

          return bTime - aTime;
        });

        setNotifications(items);

        /*
          詳情畫面已開啟時，持續同步 Firestore 的最新貼文資料。
          按讚或收藏後，Modal 裡面的數字和圖示會立即更新。
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

  const sortedComments = useMemo(() => {
    const comments = [...(selectedPost?.comments || [])];

    if (commentSortMode === "new") {
      comments.sort((a: any, b: any) => {
        const timeA = getCreatedAtValue(a.createdAt);
        const timeB = getCreatedAtValue(b.createdAt);

        return timeB - timeA;
      });
    }

    if (commentSortMode === "likes") {
      comments.sort((a: any, b: any) => {
        return (b.likes || 0) - (a.likes || 0);
      });
    }

    return comments;
  }, [selectedPost?.comments, commentSortMode]);

  /*
    貼文按讚：
    邏輯和首頁一致。
  */
  const handleLikePost = async (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const likedBy = Array.isArray(post.likedBy)
      ? post.likedBy
      : [];

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
    貼文收藏：
    邏輯和首頁一致。
  */
  const handleSavePost = async (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const savedBy = Array.isArray(post.savedBy)
      ? post.savedBy
      : [];

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
  const handleDeletePost = (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const isOwnPost =
      post.authorId === deviceId ||
      post.deviceId === deviceId;

    if (!isOwnPost) {
      Alert.alert("無法刪除", "你只能刪除自己發出的貼文");

      return;
    }

    Alert.alert(
      "刪除貼文",
      "確定要刪除這則貼文嗎？",
      [
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

              Alert.alert("已刪除貼文");
            } catch (error) {
              console.error("刪除貼文失敗:", error);

              Alert.alert(
                "刪除失敗",
                "請稍後再試",
              );
            }
          },
        },
      ],
    );
  };

  /*
    留言按讚：
    保留通知頁原本已有的功能。
  */
  const handleLikeComment = async (commentId: string) => {
    if (!selectedPost || !deviceId) {
      return;
    }

    const updatedComments = (selectedPost.comments || []).map(
      (comment: any) => {
        if (comment.id !== commentId) {
          return comment;
        }

        const likedBy = Array.isArray(comment.likedBy)
          ? comment.likedBy
          : [];

        const hasLiked = likedBy.includes(deviceId);

        return {
          ...comment,
          likes: (comment.likes || 0) + (hasLiked ? -1 : 1),
          likedBy: hasLiked
            ? likedBy.filter((id: string) => id !== deviceId)
            : [...likedBy, deviceId],
        };
      },
    );

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

  const openPostDetail = async (
    notificationId: string,
    post: any,
  ) => {
    await markNotificationAsRead(notificationId);

    setTargetCommentId(notificationId);
    setSelectedPost(post);
    setDetailVisible(true);
  };

  const closePostDetail = () => {
    setDetailVisible(false);
    setSelectedPost(null);
    setTargetCommentId(null);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>通知</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#9a7fd2" />
            <Text style={styles.loadingText}>讀取中...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              暫時沒有新的留言通知
            </Text>

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
                  onPress={() =>
                    openPostDetail(item.id, item.post)
                  }
                >
                  <View style={styles.leftColumn}>
                    {renderAvatar(item.comment.userAvatar, 48)}
                  </View>

                  <View style={styles.bodyColumn}>
                    <View style={styles.nameRow}>
                      <Text
                        style={styles.userName}
                        numberOfLines={1}
                      >
                        {item.comment.userName || "匿名小夥伴"}
                      </Text>

                      <Text style={styles.commentLabel}>
                        {" "}留言：
                      </Text>
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
                      source={{ uri: item.comment.imageUrl }}
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
          sortedComments={sortedComments}
          commentSortMode={commentSortMode}
          onCommentSortChange={setCommentSortMode}
          onLikeComment={handleLikeComment}
          onDeletePost={handleDeletePost}
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
    backgroundColor: "#f7f5ff",
    paddingHorizontal: 16,
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
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
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
    backgroundColor: "#eee8ff",
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
    borderRadius: 12,
    marginLeft: 12,
    resizeMode: "cover",
  },
});