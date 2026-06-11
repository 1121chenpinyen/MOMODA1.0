import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
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
  waterDropToastVisible?: boolean;

  // 從通知頁進入時，用來定位特定留言
  targetCommentId?: string | null;

  // 貼文按讚與收藏功能
  currentUserId?: string;
  onLikePost?: (post: any) => void;
  onSavePost?: (post: any) => void;

  onDeletePost?: (post: any) => void;

  // 留言相關功能
  profileMap?: Record<string, any>;
  sortedComments?: Comment[];
  commentSortMode?: "new" | "likes";
  onCommentSortChange?: (mode: "new" | "likes") => void;
  onLikeComment?: (commentId: string) => void;

  // 留言輸入框
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

function areSameComment(firstComment: any, secondComment: any) {
  if (firstComment === secondComment) {
    return true;
  }

  if (
    typeof firstComment === "string" ||
    typeof secondComment === "string"
  ) {
    return firstComment === secondComment;
  }

  if (firstComment?.id && secondComment?.id) {
    return firstComment.id === secondComment.id;
  }

  return (
    firstComment?.text === secondComment?.text &&
    firstComment?.userId === secondComment?.userId &&
    getCreatedAtValue(firstComment?.createdAt) ===
      getCreatedAtValue(secondComment?.createdAt)
  );
}

function getCommentId(
  postId: string,
  comment: any,
  fallbackIndex: number,
  originalComments: any[],
) {
  if (typeof comment !== "string" && comment?.id) {
    return comment.id;
  }

  const originalIndex = originalComments.findIndex((originalComment) =>
    areSameComment(originalComment, comment),
  );

  const finalIndex =
    originalIndex >= 0 ? originalIndex : fallbackIndex;

  const createdAtValue =
    typeof comment === "string"
      ? 0
      : getCreatedAtValue(comment?.createdAt);

  return `${postId}_${finalIndex}_${createdAtValue}`;
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
  waterDropToastVisible = false,
  targetCommentId = null,
  currentUserId = "",
  onLikePost,
  onSavePost,
  onDeletePost,
  profileMap = {},
  sortedComments,
  commentSortMode = "new",
  onCommentSortChange,
  onLikeComment,
  showCommentInput = false,
  renderCommentInput,
}: PostDetailModalProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  // 留言區塊相對於 ScrollView 的位置
  const commentSectionYRef = useRef(0);

  // 每一則留言相對於留言區塊的位置
  const commentPositionsRef = useRef<Record<string, number>>({});

  // 記錄閃爍動畫計時器
  const highlightTimersRef = useRef<
    ReturnType<typeof setTimeout>[]
  >([]);

  /*
    記錄目前已經顯示過提示動畫的留言。
    在 Modal 沒有關閉前，不會清除這個值。
    因此按讚、收藏或更新貼文時，不會再次閃爍。
  */
  const revealedRequestRef = useRef("");

  const [highlightedCommentId, setHighlightedCommentId] =
    useState<string | null>(null);

  const postId = post?.id || "";

  const postTags = post ? getPostTags(post) : [];

  const originalComments = Array.isArray(post?.comments)
    ? post.comments
    : [];

  /*
    有傳入排序後留言時，使用排序後留言。
    沒有傳入時，直接使用貼文內的留言。
  */
  const comments: any[] = sortedComments ?? originalComments;

  const [orderedCommentIds, setOrderedCommentIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const computeOrderedCommentIds = (
    commentList: any[],
    mode: "new" | "likes",
  ) => {
    return [...commentList]
      .map((comment, index) => ({
        id: getCommentId(postId, comment, index, originalComments),
        comment,
      }))
      .sort((a, b) => {
        if (mode === "likes") {
          return (b.comment.likes || 0) - (a.comment.likes || 0);
        }

        const timeA = getCreatedAtValue(a.comment.createdAt);
        const timeB = getCreatedAtValue(b.comment.createdAt);
        return timeB - timeA;
      })
      .map((item) => item.id);
  };

  const orderedComments = useMemo(() => {
    if (orderedCommentIds.length === 0) {
      return comments;
    }

    const commentMap = new Map(
      comments.map((comment, index) => [
        getCommentId(postId, comment, index, originalComments),
        comment,
      ]),
    );

    const ordered = orderedCommentIds
      .map((id) => commentMap.get(id))
      .filter((comment): comment is any => Boolean(comment));

    const remaining = comments.filter((comment, index) => {
      const id = getCommentId(postId, comment, index, originalComments);
      return !orderedCommentIds.includes(id);
    });

    return [...ordered, ...remaining];
  }, [comments, orderedCommentIds, originalComments, postId]);

  const previousCommentSortModeRef = useRef<"new" | "likes">(
    commentSortMode,
  );

  useEffect(() => {
    if (
      postId &&
      (previousCommentSortModeRef.current !== commentSortMode ||
        orderedCommentIds.length === 0)
    ) {
      setOrderedCommentIds(
        computeOrderedCommentIds(comments, commentSortMode),
      );
    }

    previousCommentSortModeRef.current = commentSortMode;
  }, [commentSortMode, comments, orderedCommentIds.length, postId]);

  const handleRefreshComments = () => {
    setRefreshing(true);
    setOrderedCommentIds(
      computeOrderedCommentIds(comments, commentSortMode),
    );
    setRefreshing(false);
  };

  const hasLikedPost = (post?.likedBy || []).includes(currentUserId);

  const hasSavedPost = (post?.savedBy || []).includes(currentUserId);
  const isOwnPost =
  !!currentUserId &&
  (post?.authorId === currentUserId ||
    post?.deviceId === currentUserId);

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

  /*
    自動捲動到從通知頁點擊的留言，並快速閃爍兩次。

    重要：
    dependency array 只監聽 postId，不監聽整個 post 物件。
    因此收藏、按讚或留言更新後，不會重新觸發動畫。
  */
  const revealTargetComment = useCallback(() => {
    if (!visible || !postId || !targetCommentId) {
      return;
    }

    const requestKey = `${postId}:${targetCommentId}`;

    // 同一次開啟期間已經執行過，不再重複播放
    if (revealedRequestRef.current === requestKey) {
      return;
    }

    const commentY =
      commentPositionsRef.current[targetCommentId];

    // 留言尚未完成排版時，稍後會透過 onLayout 再次嘗試
    if (typeof commentY !== "number") {
      return;
    }

    // 先記錄再執行動畫，避免 Firestore 更新後重新播放
    revealedRequestRef.current = requestKey;

    const scrollY =
      commentSectionYRef.current + commentY - 24;

    scrollViewRef.current?.scrollTo({
      y: Math.max(scrollY, 0),
      animated: true,
    });

    clearHighlightTimers();

    /*
      快速閃爍兩次：
      原色 → 淡紫色 → 原色 → 淡紫色 → 原色
    */
    scheduleHighlightChange(() => {
      setHighlightedCommentId(targetCommentId);
    }, 100);

    scheduleHighlightChange(() => {
      setHighlightedCommentId(null);
    }, 400);

    scheduleHighlightChange(() => {
      setHighlightedCommentId(targetCommentId);
    }, 550);

    scheduleHighlightChange(() => {
      setHighlightedCommentId(null);
    }, 1050);
  }, [
    clearHighlightTimers,
    postId,
    scheduleHighlightChange,
    targetCommentId,
    visible,
  ]);

  /*
    Modal 開啟時嘗試定位留言。
    注意：這裡不會在 Modal 開啟期間重設 revealedRequestRef。
  */
  useEffect(() => {
    if (!visible) {
      // 關閉後才清除，下次重新進入時才會再次閃爍
      revealedRequestRef.current = "";
      setHighlightedCommentId(null);
      clearHighlightTimers();

      return;
    }

    const timer = setTimeout(() => {
      revealTargetComment();
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [
    clearHighlightTimers,
    postId,
    revealTargetComment,
    targetCommentId,
    visible,
  ]);

  /*
    切換至另一篇貼文時，清空前一篇貼文的位置紀錄。
    同一篇貼文按讚或收藏時，postId 不變，所以不受影響。
  */
  useEffect(() => {
    commentPositionsRef.current = {};
    commentSectionYRef.current = 0;
  }, [postId]);

  useEffect(() => {
    return () => {
      clearHighlightTimers();
    };
  }, [clearHighlightTimers]);

  const scrollToComments = () => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(commentSectionYRef.current - 12, 0),
      animated: true,
    });
  };

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
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={onClose}
            >
              <Ionicons
                name="chevron-back"
                size={26}
                color="#333333"
              />
            </TouchableOpacity>

            <Text style={styles.postDetailTitle}>
              貼文詳情
            </Text>

            <View style={styles.headerActionButton} />
          </View>
          {waterDropToastVisible ? (
            <View style={styles.waterDropToast}>
              <Ionicons
                name="water"
                size={20}
                color="#6FA8DC"
              />

              <Text style={styles.waterDropToastText}>
                獲得 3 個水滴
              </Text>
            </View>
          ) : null}

          {post ? (
            <ScrollView
              ref={scrollViewRef}
              style={styles.postDetailContent}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefreshComments}
                  tintColor="#B1D497"
                />
              }
              onContentSizeChange={() => {
                /*
                  內容載入或圖片尺寸變化時再次嘗試定位。
                  若已經顯示過動畫，revealTargetComment 會直接 return。
                */
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

                  {isOwnPost && onDeletePost ? (
                    <TouchableOpacity
                      style={styles.deletePostButton}
                      onPress={() => {
                        onDeletePost(post);
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#aaaaaa"
                      />
                    </TouchableOpacity>
                  ) : null}
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

                {/* 貼文按讚、留言、收藏 */}
                <View style={styles.postActionRow}>
                  <TouchableOpacity
                    style={styles.postActionBtn}
                    onPress={() => {
                      onLikePost?.(post);
                    }}
                    disabled={!onLikePost}
                  >
                    <Ionicons
                      name={
                        hasLikedPost
                          ? "heart"
                          : "heart-outline"
                      }
                      size={22}
                      color={
                        hasLikedPost
                          ? "#E07A7A"
                          : "#999999"
                      }
                    />

                    <Text
                      style={styles.postActionText}
                    >
                      {post.likes || 0}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.postActionBtn}
                    onPress={scrollToComments}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={21}
                      color="#7FA8B8"
                    />

                    <Text style={styles.postActionText}>
                      {(post.comments || []).length}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.postActionBtn}
                    onPress={() => {
                      onSavePost?.(post);
                    }}
                    disabled={!onSavePost}
                  >
                    <Ionicons
                      name={
                        hasSavedPost
                          ? "bookmark"
                          : "bookmark-outline"
                      }
                      size={21}
                      color="#D39B5E"
                    />

                    <Text style={styles.postActionText}>
                      {(post.savedBy || []).length}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 留言區段 */}
              <View
                style={styles.detailCommentSection}
                onLayout={(event) => {
                  commentSectionYRef.current =
                    event.nativeEvent.layout.y;

                  revealTargetComment();
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
                        onPress={() => {
                          onCommentSortChange("new");
                        }}
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
                        onPress={() => {
                          onCommentSortChange("likes");
                        }}
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

                {orderedComments.length === 0 ? (
                  <View style={styles.noCommentBox}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={42}
                      color="#F0F4EC"
                    />

                    <Text style={styles.noCommentText}>
                      目前沒有留言
                    </Text>
                  </View>
                ) : (
                  orderedComments.map((comment: any, index: number) => {
                    const commentId = getCommentId(
                      postId,
                      comment,
                      index,
                      originalComments,
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

                    const hasLikedComment =
                      likedBy.includes(currentUserId);

                    return (
                      <View
                        key={commentId}
                        onLayout={(event) => {
                          commentPositionsRef.current[commentId] =
                            event.nativeEvent.layout.y;

                          /*
                            當目標留言剛完成排版時立刻嘗試定位。
                            已顯示過的留言不會再次觸發動畫。
                          */
                          revealTargetComment();
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
                            typeof comment !== "string" ? (
                              <TouchableOpacity
                                onPress={() => {
                                  onLikeComment(commentId);
                                }}
                                style={styles.commentLikeBtn}
                              >
                                <Ionicons
                                  name={
                                    hasLikedComment
                                      ? "heart"
                                      : "heart-outline"
                                  }
                                  size={16}
                                  color={
                                    hasLikedComment
                                      ? "#E07A7A"
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
    backgroundColor: "#F7F3EC",
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

  headerActionButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  postDetailContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  postDetailCard: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 20,
    backgroundColor: "#ffffff",
  },

  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  deletePostButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "#F0F4EC",
  },

  postTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#777",
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
    backgroundColor: "#B1D497",
  },

  videoText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },

  postActionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#eeeeee",
  },

  postActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 22,
  },

  postActionText: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: "600",
    color: "#666666",
  },

  postLikedText: {
    color: "#E07A7A",
  },

  detailCommentSection: {
    padding: 16,
    marginBottom: 100,
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
    backgroundColor: "#F0F4EC",
  },

  commentSortBtnActive: {
    backgroundColor: "#B1D497",
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
    backgroundColor: "#F0F4EC",
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
  waterDropToast: {
    position: "absolute",
    top: 150,
    left: 50,
    right: 50,
    zIndex: 999,
    elevation: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#B1D497",
    borderRadius: 999,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },

  waterDropToastText: {
    marginLeft: 7,
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});