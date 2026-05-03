import { Ionicons } from "@expo/vector-icons";
import {
    arrayRemove,
    arrayUnion,
    doc,
    getDoc,
    updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../config/firebaseConfig";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface FeedPostProps {
  post: {
    id: string;
    content: string;
    imageUri?: string;
    videoUri?: string;
    createdAt?: any;
    deviceId: string;
    userId?: string;
    likedBy?: string[];
    savedBy?: string[];
    commentCount?: number;
  };
  userDeviceId: string;
  userAvatar?: string;
  onCommentPress: (post: any) => void;
  onLikeChange?: () => void;
}

export default function FeedPost({
  post,
  userDeviceId,
  userAvatar,
  onCommentPress,
  onLikeChange,
}: FeedPostProps) {
  const [isLiked, setIsLiked] = useState(
    post.likedBy?.includes(userDeviceId) || false,
  );
  const [isSaved, setIsSaved] = useState(
    post.savedBy?.includes(userDeviceId) || false,
  );
  const [authorAvatar, setAuthorAvatar] = useState(userAvatar);
  const [likeCount, setLikeCount] = useState(post.likedBy?.length || 0);

  useEffect(() => {
    // 取得作者頭貼
    if (post.deviceId && !authorAvatar) {
      const fetchAuthorAvatar = async () => {
        try {
          const profileDoc = await getDoc(doc(db, "profiles", post.deviceId));
          if (profileDoc.exists()) {
            setAuthorAvatar(profileDoc.data().avatarUrl);
          }
        } catch (error) {
          console.error("取得作者頭貼失敗:", error);
        }
      };
      fetchAuthorAvatar();
    }
  }, [post.deviceId, authorAvatar]);

  const handleLike = async () => {
    try {
      const postRef = doc(db, "chat", post.id);
      if (isLiked) {
        await updateDoc(postRef, {
          likedBy: arrayRemove(userDeviceId),
        });
        setIsLiked(false);
        setLikeCount((c) => c - 1);
      } else {
        await updateDoc(postRef, {
          likedBy: arrayUnion(userDeviceId),
        });
        setIsLiked(true);
        setLikeCount((c) => c + 1);
      }
      onLikeChange?.();
    } catch (error) {
      console.error("更新點讚失敗:", error);
    }
  };

  const handleSave = async () => {
    try {
      const postRef = doc(db, "chat", post.id);
      if (isSaved) {
        await updateDoc(postRef, {
          savedBy: arrayRemove(userDeviceId),
        });
        setIsSaved(false);
      } else {
        await updateDoc(postRef, {
          savedBy: arrayUnion(userDeviceId),
        });
        setIsSaved(true);
      }
    } catch (error) {
      console.error("更新收藏失敗:", error);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = new Date(timestamp.seconds * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "剛剛";
    if (diffMins < 60) return `${diffMins}分鐘前`;
    if (diffHours < 24) return `${diffHours}小時前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString("zh-TW");
  };

  const isAuthor = post.deviceId === userDeviceId;

  return (
    <View style={styles.postContainer}>
      {/* 帖子頭部 */}
      <View style={styles.header}>
        <Image
          source={
            authorAvatar
              ? { uri: authorAvatar }
              : require("../assets/avatar-placeholder.png")
          }
          style={styles.avatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.username}>
            {isAuthor ? "你" : post.userId || post.deviceId}
          </Text>
          <Text style={styles.timestamp}>{formatTime(post.createdAt)}</Text>
        </View>
      </View>

      {/* 帖子內容 */}
      <View style={styles.contentSection}>
        <Text style={styles.content}>{post.content}</Text>
      </View>

      {/* 帖子圖片 */}
      {post.imageUri && (
        <Image source={{ uri: post.imageUri }} style={styles.postImage} />
      )}

      {/* 互動按鈕 */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, isLiked && styles.actionBtnActive]}
          onPress={handleLike}
          activeOpacity={1}
        >
          <Ionicons
            name={isLiked ? "heart" : "heart-outline"}
            size={20}
            color={isLiked ? "#ff6b6b" : "#888"}
          />
          <Text style={[styles.actionText, isLiked && { color: "#ff6b6b" }]}>
            點讚 {likeCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onCommentPress(post)}
          activeOpacity={1}
        >
          <Ionicons name="chatbubble-outline" size={20} color="#888" />
          <Text style={styles.actionText}>留言 {post.commentCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, isSaved && styles.actionBtnActive]}
          onPress={handleSave}
          activeOpacity={1}
        >
          <Ionicons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={20}
            color={isSaved ? "#a29add" : "#888"}
          />
          <Text style={[styles.actionText, isSaved && { color: "#a29add" }]}>
            收藏
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={1}>
          <Ionicons name="share-social-outline" size={20} color="#888" />
          <Text style={styles.actionText}>分享</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  postContainer: {
    backgroundColor: "#fff",
    marginBottom: 8,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#ddd",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: "#eee",
  },
  headerInfo: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  contentSection: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  content: {
    fontSize: 15,
    color: "#333",
    lineHeight: 20,
  },
  postImage: {
    width: SCREEN_WIDTH,
    height: Math.floor(SCREEN_WIDTH * 0.75),
    resizeMode: "cover",
    marginVertical: 8,
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 0.5,
    borderColor: "#eee",
    paddingVertical: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 8,
  },
  actionBtnActive: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginHorizontal: 4,
  },
  actionText: {
    fontSize: 13,
    color: "#888",
    marginLeft: 6,
    fontWeight: "500",
  },
});
