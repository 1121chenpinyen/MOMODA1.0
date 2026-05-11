import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { db, storage } from "../../config/firebaseConfig";
import { getDeviceId } from "../../utils/getDeviceId";
import { getRandomVariantForTag } from "../../utils/plantCatalog";
import { createPlantForPost, getGarden, growPlant } from "../../utils/storage";

const TAGS = [
  "心情",
  "人際",
  "學業/工作",
  "飲食",
  "運動",
  "寵物",
  "金錢",
  "娛樂",
  "自我成長",
  "其他",
];

type MediaType = {
  url: string;
  type: "photo" | "video";
  width?: number;
  height?: number;
  fileSize?: number;
  duration?: number;
};

type UserType = {
  userId: string;
  name: string;
  avatar: string;
};

type CommentType = {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userAvatar: string;
  createdAt: any;

  likes?: number;
  likedBy?: string[];
};

type PostType = {
  id: string;
  text: string;
  tag?: string;
  media?: MediaType | null;
  likes?: number;
  likedBy?: string[];
  comments?: CommentType[];
  saved?: boolean;
  savedBy?: string[];
  createdAt?: any;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
};

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

export default function HomeScreen() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserType>({
    userId: "",
    name: "匿名小夥伴",
    avatar: "",
  });

  const [posts, setPosts] = useState<PostType[]>([]);
  const [publishVisible, setPublishVisible] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostType | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, any>>({});
  const [searchText, setSearchText] = useState("");
  const [selectedFilterTag, setSelectedFilterTag] = useState("");
  const [sortMode, setSortMode] = useState<"new" | "likes" | "saves">("new");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [commentSortMode, setCommentSortMode] = useState<"new" | "likes">(
    "new",
  );
  const handleLikeComment = async (commentId: string) => {
    if (!selectedPost || !currentUser.userId) return;

    const updatedComments = (selectedPost.comments || []).map((c: any) => {
      if (c.id !== commentId) return c;

      const likedBy = c.likedBy || [];
      const hasLiked = likedBy.includes(currentUser.userId);

      return {
        ...c,
        likes: (c.likes || 0) + (hasLiked ? -1 : 1),
        likedBy: hasLiked
          ? likedBy.filter((id: string) => id !== currentUser.userId)
          : [...likedBy, currentUser.userId],
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
    } catch {
      Alert.alert("錯誤", "留言按讚失敗");
    }
  };
  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const initUser = async () => {
      try {
        const deviceId = await getDeviceId();

        const profileRef = doc(db, "profiles", deviceId);

        unsubscribeProfile = onSnapshot(profileRef, (profileSnap) => {
          if (profileSnap.exists()) {
            const data = profileSnap.data();

            setCurrentUser({
              userId: deviceId,
              name: data.userId || "匿名小夥伴",
              avatar: data.avatarUrl || "",
            });
          } else {
            setCurrentUser({
              userId: deviceId,
              name: "匿名小夥伴",
              avatar: "",
            });
          }
        });
      } catch (error) {
        console.log("監聽使用者資料失敗:", error);
      }
    };

    initUser();

    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: PostType[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PostType, "id">),
      }));

      setPosts(list);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const authorIds = Array.from(
      new Set(posts.map((post) => post.authorId).filter(Boolean)),
    );

    if (authorIds.length === 0) return;

    const unsubscribes = authorIds.map((authorId) => {
      const profileRef = doc(db, "profiles", authorId as string);

      return onSnapshot(profileRef, (snap) => {
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
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [posts]);
  useEffect(() => {
    if (!selectedPost) return;

    const latestPost = posts.find((post) => post.id === selectedPost.id);

    if (latestPost) {
      setSelectedPost(latestPost);
    }
  }, [posts, selectedPost?.id]);
  const sortedComments = useMemo(() => {
    const comments = [...(selectedPost?.comments || [])];

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
  }, [selectedPost?.comments, commentSortMode]);
  const filteredPosts = useMemo(() => {
    let result = [...posts];

    if (searchText.trim()) {
      result = result.filter((post) =>
        post.text?.toLowerCase().includes(searchText.trim().toLowerCase()),
      );
    }

    if (selectedFilterTag) {
      result = result.filter((post) => post.tag === selectedFilterTag);
    }

    if (sortMode === "saves") {
      result.sort((a, b) => {
        const savesA = (a.savedBy || []).length;
        const savesB = (b.savedBy || []).length;
        return savesB - savesA;
      });
    }

    if (sortMode === "new") {
      result.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    }

    if (sortMode === "likes") {
      result.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    return result;
  }, [posts, searchText, selectedFilterTag, sortMode]);

  const uploadMediaAsync = async (media: MediaType | null) => {
    if (!media) return null;

    const response = await fetch(media.url);
    const blob = await response.blob();

    const fileName = `posts/${Date.now()}_${media.type}`;
    const storageRef = ref(storage, fileName);

    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);

    return {
      ...media,
      url: downloadURL,
    };
  };

  const handlePublish = async (
    text: string,
    media: MediaType | null,
    tag: string,
  ) => {
    if (!text.trim() && !media) {
      Alert.alert("請輸入內容或選擇照片/影片");
      return;
    }

    if (!tag) {
      Alert.alert("請選擇標籤");
      return;
    }

    if (!currentUser.userId) {
      Alert.alert("使用者資料尚未載入完成");
      return;
    }

    try {
      setIsPublishing(true);

      const uploadedMedia = await uploadMediaAsync(media);

      const postRef = await addDoc(collection(db, "posts"), {
        text: text.trim(),
        tag,
        media: uploadedMedia,
        likes: 0,
        likedBy: [],
        comments: [],
        savedBy: [],
        createdAt: serverTimestamp(),

        authorId: currentUser.userId,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar,
      });

      const variant = getRandomVariantForTag(tag);
      if (variant) {
        await createPlantForPost(variant, postRef.id);
        setPublishVisible(false);
        router.push("/garden");
        Alert.alert("成功", `貼文已發布，植物已在花園長出來了！`);
      } else {
        setPublishVisible(false);
        Alert.alert("成功", "貼文已發布！");
      }
    } catch (error: any) {
      Alert.alert("發布失敗", error?.message || "請稍後再試");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLike = async (post: PostType) => {
    if (!currentUser.userId) return;

    const likedBy = post.likedBy || [];
    const hasLiked = likedBy.includes(currentUser.userId);

    try {
      await updateDoc(doc(db, "posts", post.id), {
        likes: increment(hasLiked ? -1 : 1),
        likedBy: hasLiked
          ? likedBy.filter((id) => id !== currentUser.userId)
          : [...likedBy, currentUser.userId],
      });
    } catch {
      Alert.alert("發生錯誤", "無法更新按讚");
    }
  };

  const handleSave = async (post: PostType) => {
    if (!currentUser.userId) return;

    const savedBy = post.savedBy || [];
    const hasSaved = savedBy.includes(currentUser.userId);

    try {
      await updateDoc(doc(db, "posts", post.id), {
        savedBy: hasSaved
          ? savedBy.filter((id) => id !== currentUser.userId)
          : [...savedBy, currentUser.userId],
      });
    } catch {
      Alert.alert("發生錯誤", "無法收藏");
    }
  };

  const openCommentModal = (post: PostType) => {
    setSelectedPost(post);
    setCommentText("");
    setCommentVisible(true);
  };

  const handleAddComment = async () => {
    if (!selectedPost) return;

    if (!commentText.trim()) {
      Alert.alert("請輸入留言");
      return;
    }

    if (!currentUser.userId) {
      Alert.alert("使用者資料尚未載入完成");
      return;
    }

    try {
      const oldComments = selectedPost.comments || [];

      const newComment: CommentType = {
        id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: commentText.trim(),
        userId: currentUser.userId,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
      };

      const updatedComments = [...oldComments, newComment];

      await updateDoc(doc(db, "posts", selectedPost.id), {
        comments: updatedComments,
      });

      try {
        const garden = await getGarden();

        // 只增長與該貼文相關的植物
        for (const plant of garden.plants || []) {
          if (plant.postId === selectedPost.id) {
            await growPlant(plant.id, 1);
          }
        }
      } catch (gardenError) {
        console.error("更新花園成長失敗:", gardenError);
      }

      Keyboard.dismiss();
      setSelectedPost({
        ...selectedPost,
        comments: updatedComments,
      });

      setCommentText("");
    } catch {
      Alert.alert("留言失敗", "請稍後再試");
    }
  };

  const handleDeletePost = async (post: PostType) => {
    if (post.authorId !== currentUser.userId) {
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
          } catch {
            Alert.alert("刪除失敗", "請稍後再試");
          }
        },
      },
    ]);
  };

  const getSortText = () => {
    if (sortMode === "new") return "最新";
    if (sortMode === "likes") return "讚數最多";
    return "收藏最多";
  };

  const renderAvatar = (avatar?: string, size = 40) => {
    if (avatar) {
      return (
        <Image
          source={{ uri: avatar }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#eee",
          }}
        />
      );
    }

    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#a29add",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name="person" size={size * 0.5} color="#fff" />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topArea}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="搜尋貼文..."
              placeholderTextColor="#aaa"
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setShowSortMenu(!showSortMenu)}
          >
            <Ionicons name="filter" size={18} color="#7b70c9" />
            <Text style={styles.sortText}>{getSortText()}</Text>
          </TouchableOpacity>
        </View>

        {showSortMenu && (
          <View style={styles.sortMenu}>
            <TouchableOpacity
              style={styles.sortMenuItem}
              onPress={() => {
                setSortMode("new");
                setShowSortMenu(false);
              }}
            >
              <Text style={styles.sortMenuText}>最新</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sortMenuItem}
              onPress={() => {
                setSortMode("likes");
                setShowSortMenu(false);
              }}
            >
              <Text style={styles.sortMenuText}>讚數最多</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sortMenuItem}
              onPress={() => {
                setSortMode("saves");
                setShowSortMenu(false);
              }}
            >
              <Text style={styles.sortMenuText}>收藏數最多</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagFilterRow}
        >
          <TouchableOpacity
            style={[
              styles.filterTag,
              selectedFilterTag === "" && styles.filterTagSelected,
            ]}
            onPress={() => setSelectedFilterTag("")}
          >
            <Text
              style={[
                styles.filterTagText,
                selectedFilterTag === "" && styles.filterTagTextSelected,
              ]}
            >
              全部
            </Text>
          </TouchableOpacity>

          {TAGS.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[
                styles.filterTag,
                selectedFilterTag === tag && styles.filterTagSelected,
              ]}
              onPress={() => setSelectedFilterTag(tag)}
            >
              <Text
                style={[
                  styles.filterTagText,
                  selectedFilterTag === tag && styles.filterTagTextSelected,
                ]}
              >
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.feed} showsVerticalScrollIndicator={false}>
        {filteredPosts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="leaf-outline" size={48} color="#c7c1ea" />
            <Text style={styles.emptyTitle}>目前沒有貼文</Text>
            <Text style={styles.emptyText}>按右下角的＋分享你的想法吧</Text>
          </View>
        ) : (
          filteredPosts.map((post) => {
            const hasLiked = (post.likedBy || []).includes(currentUser.userId);
            const isMyPost = post.authorId === currentUser.userId;
            const savedBy = post.savedBy || [];
            const hasSaved = savedBy.includes(currentUser.userId);

            return (
              <View key={post.id} style={styles.postCard}>
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
                          "匿名小夥伴"}
                      </Text>
                      <Text style={styles.postTime}>
                        {formatTime(post.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {isMyPost && (
                    <TouchableOpacity onPress={() => handleDeletePost(post)}>
                      <Ionicons name="trash-outline" size={20} color="#aaa" />
                    </TouchableOpacity>
                  )}
                </View>

                {post.tag && (
                  <View style={styles.postTag}>
                    <Text style={styles.postTagText}>#{post.tag}</Text>
                  </View>
                )}

                {post.text ? (
                  <Text style={styles.postText}>{post.text}</Text>
                ) : null}

                {post.media && post.media.type === "photo" && (
                  <Image
                    source={{ uri: post.media.url }}
                    style={styles.postImage}
                  />
                )}

                {post.media && post.media.type === "video" && (
                  <View style={styles.videoBox}>
                    <Ionicons name="videocam" size={36} color="#fff" />
                    <Text style={styles.videoText}>影片貼文</Text>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleLike(post)}
                  >
                    <Ionicons
                      name={hasLiked ? "heart" : "heart-outline"}
                      size={22}
                      color={hasLiked ? "#ff4f7b" : "#999"}
                    />
                    <Text
                      style={[styles.actionText, hasLiked && styles.likedText]}
                    >
                      {post.likes || 0}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => openCommentModal(post)}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={21}
                      color="#7b70c9"
                    />
                    <Text style={styles.actionText}>
                      {(post.comments || []).length}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleSave(post)}
                  >
                    <Ionicons
                      name={hasSaved ? "bookmark" : "bookmark-outline"}
                      size={21}
                      color="#f0a94d"
                    />
                    <Text style={styles.actionText}>
                      {(post.savedBy || []).length}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setPublishVisible(true)}
      >
        <Ionicons name="add" size={34} color="#fff" />
      </TouchableOpacity>

      <PublishDialog
        visible={publishVisible}
        onClose={() => setPublishVisible(false)}
        onPublish={handlePublish}
        isLoading={isPublishing}
        userAvatar={currentUser.avatar}
        userName={currentUser.name}
      />

      <Modal
        visible={commentVisible}
        animationType="slide"
        onRequestClose={() => setCommentVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <SafeAreaView style={styles.postDetailContainer}>
            <View style={styles.postDetailHeader}>
              <TouchableOpacity
                onPress={() => {
                  setCommentVisible(false);
                  setSelectedPost(null);
                }}
              >
                <Ionicons name="chevron-back" size={26} color="#333" />
              </TouchableOpacity>

              <Text style={styles.postDetailTitle}>貼文留言</Text>

              <View style={{ width: 26 }} />
            </View>

            {selectedPost && (
              <ScrollView
                style={styles.postDetailContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.postDetailCard}>
                  <View style={styles.postHeader}>
                    <View style={styles.authorArea}>
                      {renderAvatar(
                        profileMap[selectedPost.authorId || ""]?.avatar ||
                          selectedPost.authorAvatar,
                        40,
                      )}

                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.authorName}>
                          {profileMap[selectedPost.authorId || ""]?.name ||
                            selectedPost.authorName ||
                            "匿名小夥伴"}
                        </Text>
                        <Text style={styles.postTime}>
                          {formatTime(selectedPost.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {selectedPost.tag && (
                    <View style={styles.postTag}>
                      <Text style={styles.postTagText}>
                        #{selectedPost.tag}
                      </Text>
                    </View>
                  )}

                  {selectedPost.text ? (
                    <Text style={styles.postText}>{selectedPost.text}</Text>
                  ) : null}

                  {selectedPost.media &&
                    selectedPost.media.type === "photo" && (
                      <Image
                        source={{ uri: selectedPost.media.url }}
                        style={styles.postImage}
                      />
                    )}

                  {selectedPost.media &&
                    selectedPost.media.type === "video" && (
                      <View style={styles.videoBox}>
                        <Ionicons name="videocam" size={36} color="#fff" />
                        <Text style={styles.videoText}>影片貼文</Text>
                      </View>
                    )}
                </View>

                <View style={styles.detailCommentSection}>
                  <View style={styles.commentSortHeader}>
                    <Text style={styles.detailCommentTitle}>留言</Text>

                    <View style={styles.commentSortBtns}>
                      <TouchableOpacity
                        style={[
                          styles.commentSortBtn,
                          commentSortMode === "new" &&
                            styles.commentSortBtnActive,
                        ]}
                        onPress={() => setCommentSortMode("new")}
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
                        onPress={() => setCommentSortMode("likes")}
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
                  </View>

                  {(selectedPost.comments || []).length === 0 ? (
                    <View style={styles.noCommentBox}>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={42}
                        color="#c7c1ea"
                      />
                      <Text style={styles.noCommentText}>目前沒有留言</Text>
                    </View>
                  ) : (
                    sortedComments.map((comment: any, index: number) => {
                      const commentText =
                        typeof comment === "string" ? comment : comment.text;

                      const commentUserName =
                        typeof comment === "string"
                          ? "匿名小夥伴"
                          : comment.userName || "匿名小夥伴";

                      const commentUserAvatar =
                        typeof comment === "string"
                          ? ""
                          : comment.userAvatar || "";

                      const commentCreatedAt =
                        typeof comment === "string" ? null : comment.createdAt;

                      return (
                        <View
                          key={
                            comment.id || `${selectedPost.id}-comment-${index}`
                          }
                          style={styles.commentItem}
                        >
                          {renderAvatar(commentUserAvatar, 32)}

                          <View style={styles.commentContent}>
                            <Text style={styles.commentUserName}>
                              {commentUserName}
                            </Text>

                            <Text style={styles.commentText}>
                              {commentText}
                            </Text>

                            <View style={styles.commentBottomRow}>
                              <Text style={styles.commentTime}>
                                {formatTime(commentCreatedAt)}
                              </Text>

                              <TouchableOpacity
                                onPress={() => handleLikeComment(comment.id)}
                                style={styles.commentLikeBtn}
                              >
                                <Ionicons
                                  name={
                                    (comment.likedBy || []).includes(
                                      currentUser.userId,
                                    )
                                      ? "heart"
                                      : "heart-outline"
                                  }
                                  size={16}
                                  color={
                                    (comment.likedBy || []).includes(
                                      currentUser.userId,
                                    )
                                      ? "#ff4f7b"
                                      : "#999"
                                  }
                                />
                                <Text style={styles.commentLikeText}>
                                  {comment.likes || 0}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </ScrollView>
            )}

            <View style={styles.commentInputBar}>
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
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

interface PublishDialogProps {
  visible: boolean;
  onClose: () => void;
  onPublish: (text: string, media: MediaType | null, tag: string) => void;
  isLoading?: boolean;
  userAvatar?: string;
  userName?: string;
}

function PublishDialog({
  visible,
  onClose,
  onPublish,
  isLoading = false,
  userAvatar,
  userName = "你",
}: PublishDialogProps) {
  const [postText, setPostText] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<MediaType | null>(null);
  const [selectedTag, setSelectedTag] = useState("");

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("權限不足", "需要相簿權限才能選取照片");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        selectionLimit: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];

        setSelectedMedia({
          url: asset.uri,
          type: "photo",
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        });
      }
    } catch (error: any) {
      Alert.alert("選取失敗", error?.message || "發生未知錯誤");
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("權限不足", "需要相簿權限才能選取影片");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.7,
        selectionLimit: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];

        setSelectedMedia({
          url: asset.uri,
          type: "video",
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
          duration: asset.duration ?? undefined,
        });
      }
    } catch (error: any) {
      Alert.alert("選取失敗", error?.message || "發生未知錯誤");
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("權限不足", "需要相機權限才能拍照");
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled) {
        const asset = result.assets[0];

        setSelectedMedia({
          url: asset.uri,
          type: "photo",
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        });
      }
    } catch (error: any) {
      Alert.alert("拍照失敗", error?.message || "相機暫時不可用");
    }
  };

  const resetForm = () => {
    setPostText("");
    setSelectedMedia(null);
    setSelectedTag("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePublish = () => {
    if (!postText.trim() && !selectedMedia) {
      Alert.alert("請輸入內容或選擇照片/影片");
      return;
    }

    if (!selectedTag) {
      Alert.alert("請選擇標籤");
      return;
    }

    onPublish(postText, selectedMedia, selectedTag);
    resetForm();
  };

  const canPublish = !!selectedTag && (!!postText.trim() || !!selectedMedia);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.publishContainer}>
        <View style={styles.publishHeader}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelBtn}>取消</Text>
          </TouchableOpacity>

          <Text style={styles.publishHeaderTitle}>發布新貼文</Text>

          <TouchableOpacity
            onPress={handlePublish}
            disabled={isLoading || !canPublish}
            style={[
              styles.publishBtn,
              (isLoading || !canPublish) && styles.publishBtnDisabled,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#999" />
            ) : (
              <Text
                style={[
                  styles.publishBtnText,
                  !canPublish && styles.publishBtnTextDisabled,
                ]}
              >
                發布
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.publishContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.userSection}>
            {userAvatar ? (
              <Image source={{ uri: userAvatar }} style={styles.userAvatar} />
            ) : (
              <View style={styles.defaultAvatar}>
                <Ionicons name="person" size={22} color="#fff" />
              </View>
            )}

            <View>
              <Text style={styles.userName}>{userName || "你"}</Text>
              <Text style={styles.userStatus}>現在線上</Text>
            </View>
          </View>

          <TextInput
            style={styles.input}
            placeholder="說說你的想法..."
            placeholderTextColor="#999"
            value={postText}
            onChangeText={setPostText}
            multiline
            maxLength={500}
          />

          <View style={styles.charCounter}>
            <Text style={styles.charCountText}>{postText.length}/500</Text>
          </View>

          {selectedMedia && (
            <View style={styles.mediaPreview}>
              {selectedMedia.type === "video" ? (
                <View style={[styles.previewImage, styles.videoPlaceholder]}>
                  <Ionicons name="videocam" size={42} color="#fff" />
                  <Text style={styles.videoPlaceholderText}>已選擇影片</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: selectedMedia.url }}
                  style={styles.previewImage}
                />
              )}

              <TouchableOpacity
                style={styles.removeMediaBtn}
                onPress={() => setSelectedMedia(null)}
              >
                <Ionicons name="close-circle" size={28} color="#ff6b6b" />
              </TouchableOpacity>
            </View>
          )}

          {!selectedMedia && (
            <View style={styles.mediaOptions}>
              <Text style={styles.mediaLabel}>添加照片或影片</Text>

              <View style={styles.mediaButtonRow}>
                <TouchableOpacity style={styles.mediaBtn} onPress={takePhoto}>
                  <Ionicons name="camera" size={28} color="#a29add" />
                  <Text style={styles.mediaBtnText}>拍照</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mediaBtn} onPress={pickPhoto}>
                  <Ionicons name="image" size={28} color="#a29add" />
                  <Text style={styles.mediaBtnText}>照片</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mediaBtn} onPress={pickVideo}>
                  <Ionicons name="videocam" size={28} color="#a29add" />
                  <Text style={styles.mediaBtnText}>影片</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.tagSection}>
            <Text style={styles.tagLabel}>選擇標籤</Text>

            <View style={styles.tagGrid}>
              {TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.tagBtn,
                    selectedTag === tag && styles.tagBtnSelected,
                  ]}
                  onPress={() => setSelectedTag(tag)}
                >
                  <Text
                    style={[
                      styles.tagText,
                      selectedTag === tag && styles.tagTextSelected,
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
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
  commentInputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
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
  commentBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },

  commentLikeBtn: {
    flexDirection: "row",
    alignItems: "center",
  },

  commentLikeText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#666",
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
  container: {
    flex: 1,
    backgroundColor: "#f8f7ff",
  },
  topArea: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    zIndex: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f4f2fb",
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#333",
  },
  sortBtn: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f4f2fb",
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  sortText: {
    fontSize: 13,
    color: "#7b70c9",
    fontWeight: "700",
    marginLeft: 4,
  },
  sortMenu: {
    position: "absolute",
    right: 16,
    top: 58,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 6,
    width: 150,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 99,
  },
  sortMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sortMenuText: {
    fontSize: 14,
    color: "#444",
  },
  tagFilterRow: {
    paddingTop: 12,
    gap: 8,
  },
  filterTag: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: "#f4f2fb",
    borderRadius: 18,
  },
  filterTagSelected: {
    backgroundColor: "#a29add",
  },
  filterTagText: {
    color: "#777",
    fontSize: 13,
    fontWeight: "600",
  },
  filterTagTextSelected: {
    color: "#fff",
  },
  feed: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 128,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "bold",
    color: "#777",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: "#aaa",
  },
  postCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  authorArea: {
    flexDirection: "row",
    alignItems: "center",
  },
  authorName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
  },
  postTime: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  postTag: {
    alignSelf: "flex-start",
    backgroundColor: "#f1efff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginTop: 12,
  },
  postTagText: {
    color: "#7b70c9",
    fontSize: 13,
    fontWeight: "700",
  },
  postText: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: "#333",
  },
  postImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    marginTop: 12,
    resizeMode: "cover",
  },
  videoBox: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    backgroundColor: "#222",
    marginTop: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  videoText: {
    color: "#fff",
    marginTop: 8,
    fontWeight: "bold",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    marginTop: 14,
    paddingTop: 12,
    gap: 18,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionText: {
    marginLeft: 5,
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  likedText: {
    color: "#ff4f7b",
  },
  commentPreview: {
    marginTop: 12,
    backgroundColor: "#faf9ff",
    borderRadius: 12,
    padding: 10,
  },
  commentPreviewTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#7b70c9",
    marginBottom: 8,
  },
  commentItem: {
    flexDirection: "row",
    marginTop: 10,
  },
  commentContent: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  commentSortHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  commentSortBtns: {
    flexDirection: "row",
    backgroundColor: "#f4f2fb",
    borderRadius: 16,
    padding: 3,
  },

  commentSortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 13,
  },

  commentSortBtnActive: {
    backgroundColor: "#a29add",
  },

  commentSortText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#777",
  },

  commentSortTextActive: {
    color: "#fff",
  },
  commentUserName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#333",
  },
  commentTime: {
    fontSize: 11,
    color: "#aaa",
  },
  commentText: {
    marginTop: 4,
    fontSize: 13,
    color: "#444",
    lineHeight: 18,
  },
  fab: {
    position: "absolute",
    right: 22,
    bottom: 28,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#a29add",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  commentModal: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
  },
  commentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  commentInput: {
    minHeight: 100,
    backgroundColor: "#f7f6fb",
    borderRadius: 14,
    padding: 12,
    fontSize: 15,
    color: "#333",
    textAlignVertical: "top",
  },
  commentBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
    gap: 10,
  },
  cancelCommentBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: "#eee",
  },
  cancelCommentText: {
    color: "#666",
    fontWeight: "bold",
  },
  submitCommentBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: "#a29add",
  },
  submitCommentText: {
    color: "#fff",
    fontWeight: "bold",
  },
  publishContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  publishHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderColor: "#eee",
  },
  publishHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  cancelBtn: {
    fontSize: 16,
    color: "#666",
  },
  publishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#a29add",
    borderRadius: 20,
    minWidth: 62,
    alignItems: "center",
  },
  publishBtnDisabled: {
    backgroundColor: "#ddd",
  },
  publishBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  publishBtnTextDisabled: {
    color: "#999",
  },
  publishContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userSection: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#eee",
  },
  defaultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#a29add",
    justifyContent: "center",
    alignItems: "center",
  },
  userName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  userStatus: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  input: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#333",
    maxHeight: 150,
    textAlignVertical: "top",
    minHeight: 100,
  },
  charCounter: {
    alignItems: "flex-end",
    marginTop: 8,
  },
  charCountText: {
    fontSize: 12,
    color: "#999",
  },
  mediaPreview: {
    marginVertical: 16,
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    resizeMode: "cover",
  },
  videoPlaceholder: {
    backgroundColor: "#1f1f1f",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlaceholderText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
  },
  removeMediaBtn: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  mediaOptions: {
    marginVertical: 16,
  },
  mediaLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  mediaButtonRow: {
    flexDirection: "row",
    gap: 12,
  },
  mediaBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#a29add",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  mediaBtnText: {
    fontSize: 14,
    color: "#a29add",
    fontWeight: "bold",
    marginTop: 8,
  },
  tagSection: {
    marginVertical: 16,
    marginBottom: 24,
  },
  tagLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#eee",
  },
  tagBtnSelected: {
    backgroundColor: "#a29add",
    borderColor: "#a29add",
  },
  tagText: {
    fontSize: 14,
    color: "#555",
    fontWeight: "600",
  },
  tagTextSelected: {
    color: "#fff",
  },
});
