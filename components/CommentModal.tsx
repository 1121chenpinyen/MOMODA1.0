import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    increment,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
    FlatList,
    Image,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { db, storage } from "../config/firebaseConfig";

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  post: any;
  userDeviceId: string;
  userAvatar?: string;
  onCommentAdded?: (postId: string) => void;
}

export default function CommentModal({
  visible,
  onClose,
  post,
  userDeviceId,
  userAvatar,
  onCommentAdded,
}: CommentModalProps) {
  const [commentText, setCommentText] = useState<string>("");
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentAvatars, setCommentAvatars] = useState<Record<string, string>>(
    {},
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [postAuthorAvatar, setPostAuthorAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !post?.deviceId) {
      setPostAuthorAvatar(null);
      return;
    }

    const loadPostAuthorAvatar = async () => {
      try {
        const profileDoc = await getDoc(
          doc(db, "profiles", post.deviceId as string),
        );
        if (!profileDoc.exists()) {
          setPostAuthorAvatar(null);
          return;
        }
        setPostAuthorAvatar(profileDoc.data().avatarUrl ?? null);
      } catch (error) {
        console.error("取得貼文作者頭貼失敗:", error);
        setPostAuthorAvatar(null);
      }
    };

    loadPostAuthorAvatar();
  }, [visible, post?.deviceId]);

  // 監聽留言
  useEffect(() => {
    if (!visible || !post?.id) return;

    const q = query(
      collection(db, "replies"),
      where("messageId", "==", post.id),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const commentsData = [];
      const avatarMap: { [key: string]: string } = {};

      for (const commentDoc of snapshot.docs) {
        const data = commentDoc.data();
        commentsData.push({
          id: commentDoc.id,
          ...data,
        });

        // 取得留言者頭貼
        if (data.fromDeviceId && !avatarMap[data.fromDeviceId]) {
          try {
            const profileDoc = await getDoc(
              doc(db, "profiles", data.fromDeviceId as string),
            );
            if (profileDoc.exists()) {
              avatarMap[data.fromDeviceId] = profileDoc.data().avatarUrl;
            }
          } catch (e) {
            console.error("取得頭貼失敗:", e);
          }
        }
      }

      setComments(commentsData);
      setCommentAvatars(avatarMap);
    });

    return () => unsubscribe();
  }, [visible, post?.id]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      alert("需要相簿權限");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets?.[0]?.uri || (result as any).uri;
      if (uri) {
        setCommentImage(uri as string);
      }
    }
  };

  const handleSubmitComment = async () => {
    const trimmedText = commentText.trim();
    if (!trimmedText && !commentImage) return;

    setIsLoading(true);
    try {
      let imageUrl = null;

      // 上傳圖片
      if (commentImage) {
        if (commentImage.startsWith("file")) {
          const blob = await new Promise<Blob>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = () => resolve(xhr.response as Blob);
            xhr.onerror = () => reject(new Error("上傳失敗"));
            xhr.responseType = "blob";
            xhr.open("GET", commentImage, true);
            xhr.send(null);
          });

          const filename = `comments/${userDeviceId}_${Date.now()}.jpg`;
          const storageRef = ref(storage, filename);
          const snapshot = await uploadBytes(storageRef, blob as Blob);
          imageUrl = await getDownloadURL(snapshot.ref);
        } else {
          imageUrl = commentImage;
        }
      }

      // 新增留言
      await addDoc(collection(db, "replies"), {
        messageId: post.id,
        toDeviceId: post.deviceId,
        fromDeviceId: userDeviceId,
        replyText: trimmedText,
        imageUri: imageUrl,
        createdAt: serverTimestamp(),
        isRead: false,
        isComment: true,
      });

      // 🌱 植物成長邏輯已修改：自我回覆不會造成植物成長
      if (post?.deviceId) {
        try {
          if (userDeviceId === post.deviceId) {
            // 自己回覆自己的貼文：不觸發植物成長，也不會給水滴
          } else {
            // 別人回覆你的貼文：把成長寫到貼文上，等作者打開花園再領取
            await updateDoc(doc(db, "posts", post.id), {
              pendingGrowth: increment(1),
            });
          }
        } catch (err) {
          console.error("植物成長更新失敗:", err);
        }
      }

      if (post?.id) {
        onCommentAdded?.(post.id);
      }

      setCommentText("");
      setCommentImage(null);
    } catch (error) {
      console.error("提交留言失敗:", error);
      alert("留言失敗，請重試");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = new Date(timestamp.seconds * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "剛剛";
    if (diffMins < 60) return `${diffMins}分鐘前`;
    if (diffHours < 24) return `${diffHours}小時前`;
    return date.toLocaleDateString("zh-TW");
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* 標題 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="chevron-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>留言區</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* 原始帖子預覽 */}
        <View style={styles.postPreview}>
          <View style={styles.postMetaRow}>
            <Image
              source={
                postAuthorAvatar
                  ? { uri: postAuthorAvatar }
                  : require("../assets/avatar-placeholder.png")
              }
              style={styles.postAuthorAvatar}
            />
            <View style={styles.postMetaTextWrap}>
              <Text style={styles.postAuthorName}>
                {post?.deviceId === userDeviceId
                  ? "你"
                  : post?.userId || "使用者"}
              </Text>
              <Text style={styles.postTime}>{formatTime(post?.createdAt)}</Text>
            </View>
          </View>
          <Text style={styles.postContent} numberOfLines={2}>
            {post?.content}
          </Text>
        </View>

        {/* 留言列表 */}
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <Image
                source={
                  commentAvatars[item.fromDeviceId]
                    ? { uri: commentAvatars[item.fromDeviceId] }
                    : require("../assets/avatar-placeholder.png")
                }
                style={styles.commentAvatar}
              />
              <View style={styles.commentContent}>
                <Text style={styles.commentAuthor}>
                  {item.fromDeviceId === userDeviceId ? "你" : "使用者"}
                </Text>
                <Text style={styles.commentText}>{item.replyText}</Text>
                {item.imageUri && (
                  <Image
                    source={{ uri: item.imageUri }}
                    style={styles.commentImage}
                  />
                )}
                <Text style={styles.commentTime}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>還沒有留言呢</Text>
            </View>
          }
        />

        {/* 留言輸入框 */}
        <View style={styles.inputContainer}>
          {commentImage && (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: commentImage }}
                style={styles.imagePreview}
              />
              <TouchableOpacity
                onPress={() => setCommentImage(null)}
                style={styles.removeImageBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <Image
              source={
                userAvatar
                  ? { uri: userAvatar }
                  : require("../assets/avatar-placeholder.png")
              }
              style={styles.inputAvatar}
            />
            <TextInput
              style={styles.input}
              placeholder="說說你的想法..."
              value={commentText}
              onChangeText={setCommentText}
              placeholderTextColor="#999"
              multiline
            />
            <TouchableOpacity onPress={pickImage} style={styles.iconBtn}>
              <Ionicons name="image-outline" size={20} color="#a29add" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmitComment}
              disabled={!commentText.trim() && !commentImage}
              style={[
                styles.iconBtn,
                !commentText.trim() && !commentImage && styles.iconBtnDisabled,
              ]}
            >
              <Ionicons
                name="send"
                size={20}
                color={
                  !commentText.trim() && !commentImage ? "#ccc" : "#a29add"
                }
              />
            </TouchableOpacity>
          </View>
        </View>
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderColor: "#eee",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  postPreview: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#f9f9f9",
    borderBottomWidth: 0.5,
    borderColor: "#eee",
  },
  postMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  postAuthorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: "#eee",
  },
  postMetaTextWrap: {
    flex: 1,
  },
  postAuthorName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
  },
  postTime: {
    marginTop: 2,
    fontSize: 11,
    color: "#999",
  },
  postContent: {
    fontSize: 14,
    color: "#666",
    lineHeight: 18,
  },
  commentItem: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderColor: "#f0f0f0",
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    backgroundColor: "#eee",
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#333",
  },
  commentText: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
    lineHeight: 16,
  },
  commentImage: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    marginTop: 8,
    resizeMode: "cover",
    borderWidth: 3,
    borderColor: "#a29add",
    overflow: "hidden",
  },
  commentTime: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  inputContainer: {
    borderTopWidth: 0.5,
    borderColor: "#eee",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  imagePreviewContainer: {
    position: "relative",
    marginBottom: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: "cover",
    borderWidth: 3,
    borderColor: "#a29add",
    overflow: "hidden",
  },
  removeImageBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#666",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eee",
  },
  input: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#333",
    maxHeight: 100,
  },
  iconBtn: {
    padding: 8,
  },
  iconBtnDisabled: {
    opacity: 0.5,
  },
});
