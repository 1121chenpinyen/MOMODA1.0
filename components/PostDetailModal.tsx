import { Ionicons } from "@expo/vector-icons";
import {
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface Comment {
  id?: string;
  text: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  createdAt?: any;
  imageUrl?: string;
  likes?: number;
  likedBy?: string[];
}

interface PostDetailModalProps {
  visible: boolean;
  post: any;
  onClose: () => void;
  profileMap?: Record<string, any>;
  sortedComments?: Comment[];
  commentSortMode?: "new" | "likes";
  onCommentSortChange?: (mode: "new" | "likes") => void;
  onLikeComment?: (commentId: string) => void;
  showCommentInput?: boolean;
  renderCommentInput?: () => React.ReactNode;
}

function formatTime(createdAt: any) {
  if (!createdAt) return "剛剛";

  const date = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (diffHour < 24) return `${diffHour} 小時前`;
  if (diffDay < 7) return `${diffDay} 天前`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getPostTags(post: any) {
  return post.tags && post.tags.length > 0
    ? post.tags
    : post.tag
    ? [post.tag]
    : [];
}

function renderAvatar(avatar: string | undefined, size: number = 40) {
  return (
    <Image
      source={
        avatar
          ? { uri: avatar }
          : require("../assets/avatar-placeholder.png")
      }
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#eee",
      }}
    />
  );
}

export default function PostDetailModal({
  visible,
  post,
  onClose,
  profileMap = {},
  sortedComments = [],
  commentSortMode = "new",
  onCommentSortChange,
  onLikeComment,
  showCommentInput = false,
  renderCommentInput,
}: PostDetailModalProps) {
  const postTags = post ? getPostTags(post) : [];
  const comments = post?.comments || sortedComments || [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <SafeAreaView style={styles.postDetailContainer}>
          <View style={styles.postDetailHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="chevron-back" size={26} color="#333" />
            </TouchableOpacity>

            <Text style={styles.postDetailTitle}>貼文詳情</Text>

            <View style={{ width: 26 }} />
          </View>

          {post ? (
            <ScrollView
              style={styles.postDetailContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* 貼文卡片 */}
              <View style={styles.postDetailCard}>
                <View style={styles.postHeader}>
                  <View style={styles.authorArea}>
                    {renderAvatar(
                      profileMap[post.authorId || ""]?.avatar ||
                        post.authorAvatar,
                      40,
                    )}

                    <View style={{ marginLeft: 10 }}>
                      <Text style={styles.authorName}>
                        {profileMap[post.authorId || ""]?.name ||
                          post.authorName ||
                          post.userId ||
                          "匿名小夥伴"}
                      </Text>
                      <Text style={styles.postTime}>
                        {formatTime(post.createdAt)}
                      </Text>
                    </View>
                  </View>
                </View>

                {postTags.length > 0 && (
                  <View style={styles.postTagRow}>
                    {postTags.map((tag) => (
                      <View key={tag} style={styles.postTag}>
                        <Text style={styles.postTagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {post.text || post.content ? (
                  <Text style={styles.postText}>
                    {post.text || post.content}
                  </Text>
                ) : null}

                {post.imageUri ? (
                  <Image
                    source={{ uri: post.imageUri }}
                    style={styles.postImage}
                  />
                ) : null}

                {post.media && post.media.type === "photo" ? (
                  <Image
                    source={{ uri: post.media.url }}
                    style={styles.postImage}
                  />
                ) : null}

                {post.media && post.media.type === "video" ? (
                  <View style={styles.videoBox}>
                    <Ionicons name="videocam" size={36} color="#fff" />
                    <Text style={styles.videoText}>影片貼文</Text>
                  </View>
                ) : null}
              </View>

              {/* 留言區段 */}
              <View style={styles.detailCommentSection}>
                <View style={styles.commentSortHeader}>
                  <Text style={styles.detailCommentTitle}>留言</Text>

                  {onCommentSortChange && (
                    <View style={styles.commentSortBtns}>
                      <TouchableOpacity
                        style={[
                          styles.commentSortBtn,
                          commentSortMode === "new" &&
                            styles.commentSortBtnActive,
                        ]}
                        onPress={() => onCommentSortChange("new")}
                      >
                        <Text
                          style={[
                            styles.commentSortText,
                            commentSortMode === "new" &&
                              styles.commentSortTextActive,
                          ]}
                        >
                          最新
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.commentSortBtn,
                          commentSortMode === "likes" &&
                            styles.commentSortBtnActive,
                        ]}
                        onPress={() => onCommentSortChange("likes")}
                      >
                        <Text
                          style={[
                            styles.commentSortText,
                            commentSortMode === "likes" &&
                              styles.commentSortTextActive,
                          ]}
                        >
                          讚數最高
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {comments.length === 0 ? (
                  <View style={styles.noCommentBox}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={42}
                      color="#c7c1ea"
                    />
                    <Text style={styles.noCommentText}>目前沒有留言</Text>
                  </View>
                ) : (
                  comments.map((comment: any, index: number) => {
                    const commentText =
                      typeof comment === "string" ? comment : comment.text;

                    const commentUserName =
                      typeof comment === "string"
                        ? "匿名小夥伴"
                        : comment.userName || comment.userId || "匿名小夥伴";

                    const commentUserAvatar =
                      typeof comment === "string" ? "" : comment.userAvatar || "";

                    const commentCreatedAt =
                      typeof comment === "string" ? null : comment.createdAt;

                    return (
                      <View
                        key={comment.id || `comment-${index}`}
                        style={styles.commentItem}
                      >
                        {renderAvatar(commentUserAvatar, 32)}

                        <View style={styles.commentContent}>
                          <Text style={styles.commentUserName}>
                            {commentUserName}
                          </Text>

                          <Text style={styles.commentText}>{commentText}</Text>

                          {comment.imageUrl ? (
                            <Image
                              source={{ uri: comment.imageUrl }}
                              style={styles.commentImageInPost}
                            />
                          ) : null}

                          <View style={styles.commentBottomRow}>
                            <Text style={styles.commentTime}>
                              {formatTime(commentCreatedAt)}
                            </Text>

                            {onLikeComment ? (
                              <TouchableOpacity
                                onPress={() =>
                                  onLikeComment(comment.id)
                                }
                                style={styles.commentLikeBtn}
                              >
                                <Ionicons
                                  name={
                                    (comment.likedBy || []).includes(
                                      post.deviceId,
                                    )
                                      ? "heart"
                                      : "heart-outline"
                                  }
                                  size={16}
                                  color={
                                    (comment.likedBy || []).includes(
                                      post.deviceId,
                                    )
                                      ? "#ff4f7b"
                                      : "#999"
                                  }
                                />
                                <Text style={styles.commentLikeText}>
                                  {comment.likes || 0}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {showCommentInput && renderCommentInput && (
                <View style={{ height: 120 }} />
              )}
            </ScrollView>
          ) : null}

          {showCommentInput && renderCommentInput && (
            <View style={styles.commentInputBar}>
              {renderCommentInput()}
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  postDetailContainer: {
    flex: 1,
    backgroundColor: "#f8f7ff",
  },
  postDetailHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  postDetailTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  postDetailContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  postDetailCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  postHeader: {
    marginBottom: 8,
  },
  authorArea: {
    flexDirection: "row",
    alignItems: "center",
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  postTime: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  postTagRow: {
    flexDirection: "row",
    marginVertical: 8,
    flexWrap: "wrap",
  },
  postTag: {
    backgroundColor: "#f0ecff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  postTagText: {
    fontSize: 12,
    color: "#7b70c9",
    fontWeight: "600",
  },
  postText: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
    marginVertical: 8,
  },
  postImage: {
    width: "100%",
    height: 260,
    borderRadius: 12,
    marginTop: 8,
    resizeMode: "cover",
  },
  videoBox: {
    width: "100%",
    height: 260,
    backgroundColor: "#8a7fc6",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  videoText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  detailCommentSection: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 100,
  },
  detailCommentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  commentSortHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  commentSortBtns: {
    flexDirection: "row",
    alignItems: "center",
  },
  commentSortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f4f2fb",
    marginLeft: 8,
  },
  commentSortBtnActive: {
    backgroundColor: "#7b70c9",
  },
  commentSortText: {
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
  },
  commentSortTextActive: {
    color: "#fff",
  },
  noCommentBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  noCommentText: {
    marginTop: 10,
    fontSize: 14,
    color: "#999",
    fontWeight: "600",
  },
  commentItem: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  commentContent: {
    flex: 1,
    marginLeft: 10,
  },
  commentUserName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
  },
  commentText: {
    fontSize: 14,
    color: "#333",
    marginTop: 4,
    lineHeight: 20,
  },
  commentImageInPost: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginTop: 8,
    resizeMode: "cover",
  },
  commentBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  commentTime: {
    fontSize: 12,
    color: "#999",
  },
  commentLikeBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  commentLikeText: {
    fontSize: 12,
    color: "#999",
    marginLeft: 4,
  },
  commentInputBar: {
    backgroundColor: "#fff",
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
