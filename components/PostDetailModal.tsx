import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  targetCommentId?: string | null;
  currentUserId?: string;
  profileMap?: Record<string, any>;
  sortedComments?: Comment[];
  commentSortMode?: "new" | "likes";
  onCommentSortChange?: (mode: "new" | "likes") => void;
  onLikeComment?: (commentId: string) => void;
  showCommentInput?: boolean;
  renderCommentInput?: () => ReactNode;
}

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

function getCommentId(
  postId: string,
  comment: any,
  index: number,
) {
  if (typeof comment !== "string" && comment?.id) {
    return comment.id;
  }

  const createdAt =
    typeof comment === "string"
      ? 0
      : getCreatedAtValue(comment?.createdAt);

  return `${postId}_${index}_${createdAt}`;
}

function getPostTags(post: any) {
  return post.tags && post.tags.length > 0
    ? post.tags
    : post.tag
      ? [post.tag]
      : [];
}

function renderAvatar(
  avatar: string | undefined,
  size: number = 40,
) {
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
        backgroundColor: "#eeeeee",
      }}
    />
  );
}

export default function PostDetailModal({
  visible,
  post,
  onClose,
  targetCommentId = null,
  currentUserId = "",
  profileMap = {},
  sortedComments = [],
  commentSortMode = "new",
  onCommentSortChange,
  onLikeComment,
  showCommentInput = false,
  renderCommentInput,
}: PostDetailModalProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  const commentSectionYRef = useRef(0);

  const commentPositionsRef = useRef<Record<string, number>>({});

  const highlightTimersRef = useRef<
    ReturnType<typeof setTimeout>[]
  >([]);

  const revealedRequestRef = useRef("");

  const [highlightedCommentId, setHighlightedCommentId] =
    useState<string | null>(null);

  const postTags = post ? getPostTags(post) : [];

  const comments =
    sortedComments.length > 0
      ? sortedComments
      : post?.comments || [];

  const clearHighlightTimers = useCallback(() => {
    highlightTimersRef.current.forEach((timer) => {
      clearTimeout(timer);
    });

    highlightTimersRef.current = [];
  }, []);

  const scheduleHighlightChange = useCallback(
    (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);

      highlightTimersRef.current.push(timer);
    },
    [],
  );

  const revealTargetComment = useCallback(() => {
    if (!visible || !post || !targetCommentId) {
      return;
    }

    const requestKey = `${post.id}:${targetCommentId}`;

    if (revealedRequestRef.current === requestKey) {
      return;
    }

    const commentY = commentPositionsRef.current[targetCommentId];

    if (typeof commentY !== "number") {
      return;
    }

    revealedRequestRef.current = requestKey;

    const scrollY =
      commentSectionYRef.current + commentY - 24;

    scrollViewRef.current?.scrollTo({
      y: Math.max(scrollY, 0),
      animated: true,
    });

    clearHighlightTimers();

    /*
      顏色切換效果：
      原色 → 淡紫色 → 原色 → 淡紫色 → 原色
    */

    scheduleHighlightChange(() => {
      setHighlightedCommentId(targetCommentId);
    }, 250);

    scheduleHighlightChange(() => {
      setHighlightedCommentId(null);
    }, 1050);

    
  }, [
    clearHighlightTimers,
    post,
    scheduleHighlightChange,
    targetCommentId,
    visible,
  ]);

  useEffect(() => {
    if (!visible) {
      revealedRequestRef.current = "";
      setHighlightedCommentId(null);
      clearHighlightTimers();

      return;
    }

    revealedRequestRef.current = "";

    const timer = setTimeout(() => {
      revealTargetComment();
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [
    clearHighlightTimers,
    post?.id,
    revealTargetComment,
    targetCommentId,
    visible,
  ]);

  useEffect(() => {
    return () => {
      clearHighlightTimers();
    };
  }, [clearHighlightTimers]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <SafeAreaView style={styles.postDetailContainer}>
          <View style={styles.postDetailHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons
                name="chevron-back"
                size={26}
                color="#333333"
              />
            </TouchableOpacity>

            <Text style={styles.postDetailTitle}>
              貼文詳情
            </Text>

            <View style={styles.headerPlaceholder} />
          </View>

          {post ? (
            <ScrollView
              ref={scrollViewRef}
              style={styles.postDetailContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => {
                revealTargetComment();
              }}
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

                    <View style={styles.authorTextArea}>
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
                    {postTags.map((tag: string) => (
                      <View key={tag} style={styles.postTag}>
                        <Text style={styles.postTagText}>
                          #{tag}
                        </Text>
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
                    <Ionicons
                      name="videocam"
                      size={36}
                      color="#ffffff"
                    />

                    <Text style={styles.videoText}>
                      影片貼文
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* 留言區段 */}
              <View
                style={styles.detailCommentSection}
                onLayout={(event) => {
                  commentSectionYRef.current =
                    event.nativeEvent.layout.y;
                }}
              >
                <View style={styles.commentSortHeader}>
                  <Text style={styles.detailCommentTitle}>
                    留言
                  </Text>

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

                    <Text style={styles.noCommentText}>
                      目前沒有留言
                    </Text>
                  </View>
                ) : (
                  comments.map((comment: any, index: number) => {
                    const commentId = getCommentId(
                      post.id,
                      comment,
                      index,
                    );

                    const commentText =
                      typeof comment === "string"
                        ? comment
                        : comment.text;

                    const commentUserName =
                      typeof comment === "string"
                        ? "匿名小夥伴"
                        : comment.userName ||
                          comment.userId ||
                          "匿名小夥伴";

                    const commentUserAvatar =
                      typeof comment === "string"
                        ? ""
                        : comment.userAvatar || "";

                    const commentCreatedAt =
                      typeof comment === "string"
                        ? null
                        : comment.createdAt;

                    const commentImageUrl =
                      typeof comment === "string"
                        ? ""
                        : comment.imageUrl || "";

                    const likedBy =
                      typeof comment === "string"
                        ? []
                        : comment.likedBy || [];

                    const likes =
                      typeof comment === "string"
                        ? 0
                        : comment.likes || 0;

                    return (
                      <View
                        key={commentId}
                        onLayout={(event) => {
                          commentPositionsRef.current[commentId] =
                            event.nativeEvent.layout.y;
                        }}
                        style={[
                          styles.commentItem,
                          highlightedCommentId === commentId &&
                            styles.highlightedCommentItem,
                        ]}
                      >
                        {renderAvatar(commentUserAvatar, 32)}

                        <View style={styles.commentContent}>
                          <Text style={styles.commentUserName}>
                            {commentUserName}
                          </Text>

                          <Text style={styles.commentText}>
                            {commentText}
                          </Text>

                          {commentImageUrl ? (
                            <Image
                              source={{ uri: commentImageUrl }}
                              style={styles.commentImageInPost}
                            />
                          ) : null}

                          <View style={styles.commentBottomRow}>
                            <Text style={styles.commentTime}>
                              {formatTime(commentCreatedAt)}
                            </Text>

                            {onLikeComment &&
                            typeof comment !== "string" &&
                            comment.id ? (
                              <TouchableOpacity
                                onPress={() => {
                                  onLikeComment(comment.id as string);
                                }}
                                style={styles.commentLikeBtn}
                              >
                                <Ionicons
                                  name={
                                    likedBy.includes(currentUserId)
                                      ? "heart"
                                      : "heart-outline"
                                  }
                                  size={16}
                                  color={
                                    likedBy.includes(currentUserId)
                                      ? "#ff4f7b"
                                      : "#999999"
                                  }
                                />

                                <Text style={styles.commentLikeText}>
                                  {likes}
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
                <View style={styles.commentInputSpacing} />
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
  keyboardAvoidingView: {
    flex: 1,
  },

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
    backgroundColor: "#ffffff",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eeeeee",
  },

  postDetailTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333333",
  },

  headerPlaceholder: {
    width: 26,
  },

  postDetailContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  postDetailCard: {
    backgroundColor: "#ffffff",
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

  authorTextArea: {
    marginLeft: 10,
  },

  authorName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333333",
  },

  postTime: {
    marginTop: 2,
    fontSize: 12,
    color: "#999999",
  },

  postTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 8,
  },

  postTag: {
    marginRight: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#f0ecff",
  },

  postTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7b70c9",
  },

  postText: {
    marginVertical: 8,
    fontSize: 16,
    color: "#333333",
    lineHeight: 24,
  },

  postImage: {
    width: "100%",
    height: 260,
    marginTop: 8,
    borderRadius: 12,
    resizeMode: "cover",
  },

  videoBox: {
    width: "100%",
    height: 260,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#8a7fc6",
  },

  videoText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },

  detailCommentSection: {
    marginBottom: 100,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#ffffff",
  },

  detailCommentTitle: {
    marginBottom: 10,
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
  },

  commentSortHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  commentSortBtns: {
    flexDirection: "row",
    alignItems: "center",
  },

  commentSortBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f4f2fb",
  },

  commentSortBtnActive: {
    backgroundColor: "#7b70c9",
  },

  commentSortText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999999",
  },

  commentSortTextActive: {
    color: "#ffffff",
  },

  noCommentBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },

  noCommentText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "600",
    color: "#999999",
  },

  commentItem: {
    flexDirection: "row",
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },

  highlightedCommentItem: {
    backgroundColor: "#e7ddff",
  },

  commentContent: {
    flex: 1,
    marginLeft: 10,
  },

  commentUserName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333333",
  },

  commentText: {
    marginTop: 4,
    fontSize: 14,
    color: "#333333",
    lineHeight: 20,
  },

  commentImageInPost: {
    width: "100%",
    height: 160,
    marginTop: 8,
    borderRadius: 12,
    resizeMode: "cover",
  },

  commentBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },

  commentTime: {
    fontSize: 12,
    color: "#999999",
  },

  commentLikeBtn: {
    flexDirection: "row",
    alignItems: "center",
  },

  commentLikeText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#999999",
  },

  commentInputSpacing: {
    height: 120,
  },

  commentInputBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderTopWidth: 0.5,
    borderTopColor: "#eeeeee",
  },
});