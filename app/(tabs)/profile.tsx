import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
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
  View,
} from "react-native";

import PostDetailModal from "../../components/PostDetailModal";
import { db, storage } from "../../config/firebaseConfig";
import { getDeviceId } from "../../utils/getDeviceId";
import {
  getGarden,
  getGlobalData,
  updateGlobalData
} from "../../utils/storage";

const { width } = Dimensions.get("window");

export default function ProfilePage() {
  const [avatar, setAvatar] = useState<string | null>(null);

  /*
    userId：使用者自己設定的顯示名稱。
    deviceId：Firebase 資料識別碼。
  */
  const [userId, setUserId] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<boolean>(false);
  const [tempId, setTempId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  const [postDays, setPostDays] = useState<Record<string, boolean>>({});

  const [activeSection, setActiveSection] = useState<"posts" | "favorites">(
    "posts",
  );
  // 貼文頁／收藏頁底線滑動動畫
  const [sectionTabsWidth, setSectionTabsWidth] = useState(0);

  const sectionUnderlineAnim = useRef(new Animated.Value(0)).current;

  const [postViewMode, setPostViewMode] = useState<"time" | "calendar">("time");

  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [favoritePosts, setFavoritePosts] = useState<any[]>([]);

  const [detailVisible, setDetailVisible] = useState(false);

  const [selectedPostDetail, setSelectedPostDetail] = useState<any | null>(
    null,
  );

  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(
    null,
  );

  const [profileMap, setProfileMap] = useState<Record<string, any>>({});

  // 留言相關狀態
  const [commentSortMode, setCommentSortMode] = useState<"new" | "likes">(
    "new",
  );

  const [commentText, setCommentText] = useState("");
  const [commentImage, setCommentImage] = useState<string | null>(null);

  /*
    避免重複發送留言：
    state 控制 Loading 畫面；
    ref 會在畫面重新渲染前立刻鎖定。
  */
  const [isSendingComment, setIsSendingComment] = useState(false);

  const isSendingCommentRef = useRef(false);
  
  // 數據統計狀態
  const [stats, setStats] = useState({
    sentPosts: 0,
    sentComments: 0,
    receivedComments: 0,
  });

  // 前一個統計值，用於數字滑動動畫
  const [prevStats, setPrevStats] = useState({
    sentPosts: 0,
    sentComments: 0,
    receivedComments: 0,
  });

  const sentPostsSlideAnim = useRef(new Animated.Value(0)).current;

  const sentCommentsSlideAnim = useRef(new Animated.Value(0)).current;

  const receivedCommentsSlideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);
  useEffect(() => {
    Animated.spring(sectionUnderlineAnim, {
      toValue: activeSection === "posts" ? 0 : 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
    }).start();
  }, [activeSection, sectionUnderlineAnim]);
  /*
    更新 profileMap：
    顯示收藏頁中其他使用者的名稱與頭像。
  */
  useEffect(() => {
    if (myPosts.length === 0 && favoritePosts.length === 0) {
      return;
    }

    const allPosts = [...myPosts, ...favoritePosts];

    const authorIds = Array.from(
      new Set(
        allPosts
          .map((post) => post.authorId || post.deviceId)
          .filter((id) => id && id !== deviceId),
      ),
    );

    if (authorIds.length === 0) {
      return;
    }

    authorIds.forEach((authorId) => {
      if (!authorId || profileMap[authorId]) {
        return;
      }

      getDoc(doc(collection(db, "profiles"), authorId as string)).then(
        (snapshot) => {
          if (!snapshot.exists()) {
            return;
          }

          const data = snapshot.data();

          setProfileMap((previousMap) => ({
            ...previousMap,
            [authorId as string]: {
              name: data.userId || "匿名小夥伴",
              avatar: data.avatarUrl || "",
            },
          }));
        },
      );
    });
  }, [myPosts, favoritePosts, deviceId, profileMap]);

  /*
    數字統計動畫
  */
  useEffect(() => {
    if (stats.sentPosts === prevStats.sentPosts) {
      return;
    }

    sentPostsSlideAnim.setValue(0);

    Animated.timing(sentPostsSlideAnim, {
      toValue: -40,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      sentPostsSlideAnim.setValue(0);

      setPrevStats((previousStats) => ({
        ...previousStats,
        sentPosts: stats.sentPosts,
      }));
    });
  }, [stats.sentPosts, prevStats.sentPosts, sentPostsSlideAnim]);

  useEffect(() => {
    if (stats.sentComments === prevStats.sentComments) {
      return;
    }

    sentCommentsSlideAnim.setValue(0);

    Animated.timing(sentCommentsSlideAnim, {
      toValue: -40,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      sentCommentsSlideAnim.setValue(0);

      setPrevStats((previousStats) => ({
        ...previousStats,
        sentComments: stats.sentComments,
      }));
    });
  }, [stats.sentComments, prevStats.sentComments, sentCommentsSlideAnim]);

  useEffect(() => {
    if (stats.receivedComments === prevStats.receivedComments) {
      return;
    }

    receivedCommentsSlideAnim.setValue(0);

    Animated.timing(receivedCommentsSlideAnim, {
      toValue: -40,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      receivedCommentsSlideAnim.setValue(0);

      setPrevStats((previousStats) => ({
        ...previousStats,
        receivedComments: stats.receivedComments,
      }));
    });
  }, [
    stats.receivedComments,
    prevStats.receivedComments,
    receivedCommentsSlideAnim,
  ]);

  /*
    詳情畫面中的留言排序
  */
  const sortedComments = useMemo(() => {
    const comments = [...(selectedPostDetail?.comments || [])];

    if (commentSortMode === "new") {
      comments.sort((firstComment: any, secondComment: any) => {
        const firstTime = new Date(firstComment.createdAt || 0).getTime();

        const secondTime = new Date(secondComment.createdAt || 0).getTime();

        return secondTime - firstTime;
      });
    }

    if (commentSortMode === "likes") {
      comments.sort((firstComment: any, secondComment: any) => {
        return (secondComment.likes || 0) - (firstComment.likes || 0);
      });
    }

    return comments;
  }, [selectedPostDetail?.comments, commentSortMode]);

  /*
    同步更新個人頁中所有地方的同一篇貼文：
    - 詳情 Modal
    - 時間順序列表
    - 月曆列表
    - 收藏頁
  */
  const updatePostInLocalState = (updatedPost: any) => {
    setSelectedPostDetail((previousPost: any | null) => {
      if (!previousPost || previousPost.id !== updatedPost.id) {
        return previousPost;
      }

      return updatedPost;
    });

    setMyPosts((previousPosts) =>
      previousPosts.map((post) =>
        post.id === updatedPost.id ? updatedPost : post,
      ),
    );

    setFavoritePosts((previousPosts) => {
      const hasSaved =
        !!deviceId &&
        Array.isArray(updatedPost.savedBy) &&
        updatedPost.savedBy.includes(deviceId);

      const alreadyExists = previousPosts.some(
        (post) => post.id === updatedPost.id,
      );

      if (!hasSaved) {
        return previousPosts.filter((post) => post.id !== updatedPost.id);
      }

      if (alreadyExists) {
        return previousPosts.map((post) =>
          post.id === updatedPost.id ? updatedPost : post,
        );
      }

      return [updatedPost, ...previousPosts];
    });
  };

  /*
    貼文按讚：
    行為與首頁詳情一致。
  */
  const handleLikePost = async (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];

    const hasLiked = likedBy.includes(deviceId);

    const updatedPost = {
      ...post,
      likes: Math.max(0, (post.likes || 0) + (hasLiked ? -1 : 1)),
      likedBy: hasLiked
        ? likedBy.filter((id: string) => id !== deviceId)
        : [...likedBy, deviceId],
    };

    /*
      先更新畫面，再寫入 Firestore。
      使用者按下按鈕後會立即看到圖示改變。
    */
    updatePostInLocalState(updatedPost);

    try {
      await updateDoc(doc(db, "posts", post.id), {
        likes: updatedPost.likes,
        likedBy: updatedPost.likedBy,
      });
    } catch (error) {
      console.error("貼文按讚失敗:", error);

      // 寫入失敗時恢復原本資料
      updatePostInLocalState(post);

      Alert.alert("發生錯誤", "無法更新按讚");
    }
  };

  /*
    貼文收藏：
    行為與首頁詳情一致。
  */
  const handleSavePost = async (post: any) => {
    if (!deviceId || !post?.id) {
      return;
    }

    const savedBy = Array.isArray(post.savedBy) ? post.savedBy : [];

    const hasSaved = savedBy.includes(deviceId);

    const updatedPost = {
      ...post,
      savedBy: hasSaved
        ? savedBy.filter((id: string) => id !== deviceId)
        : [...savedBy, deviceId],
    };

    updatePostInLocalState(updatedPost);

    try {
      await updateDoc(doc(db, "posts", post.id), {
        savedBy: updatedPost.savedBy,
      });
    } catch (error) {
      console.error("貼文收藏失敗:", error);

      updatePostInLocalState(post);

      Alert.alert("發生錯誤", "無法更新收藏");
    }
  };
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

            setMyPosts((previousPosts) =>
              previousPosts.filter((item) => item.id !== post.id),
            );

            setFavoritePosts((previousPosts) =>
              previousPosts.filter((item) => item.id !== post.id),
            );

            setSelectedPostDetail(null);
            setDetailVisible(false);

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
    留言按讚：
    行為與首頁詳情一致。
  */
  const handleLikeComment = async (commentId: string) => {
    if (!selectedPostDetail || !deviceId) {
      return;
    }

    const originalComments = Array.isArray(selectedPostDetail.comments)
      ? selectedPostDetail.comments
      : [];

    const originalComment = originalComments.find(
      (comment: any) => comment.id === commentId,
    );

    if (!originalComment) {
      return;
    }

    const previouslyLiked = Array.isArray(originalComment.likedBy)
      ? originalComment.likedBy.includes(deviceId)
      : false;

    const updatedComments = originalComments.map((comment: any) => {
      if (comment.id !== commentId) {
        return comment;
      }

      const likedBy = Array.isArray(comment.likedBy) ? comment.likedBy : [];

      const hasLiked = likedBy.includes(deviceId);

      return {
        ...comment,
        likes: Math.max(0, (comment.likes || 0) + (hasLiked ? -1 : 1)),
        likedBy: hasLiked
          ? likedBy.filter((id: string) => id !== deviceId)
          : [...likedBy, deviceId],
      };
    });

    const likedComment = updatedComments.find(
      (comment: any) => comment.id === commentId,
    );

    const shouldCreateReward =
      likedComment &&
      selectedPostDetail.authorId === deviceId &&
      likedComment.userId !== deviceId &&
      !previouslyLiked &&
      !likedComment.fertilizerRewardClaimed &&
      (!Array.isArray(likedComment.fertilizerRewards) ||
        likedComment.fertilizerRewards.length === 0);

    const finalComments = shouldCreateReward
      ? updatedComments.map((comment: any) => {
          if (comment.id !== commentId) {
            return comment;
          }

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

    const updatedPost = {
      ...selectedPostDetail,
      comments: finalComments,
    };

    updatePostInLocalState(updatedPost);

    try {
      await updateDoc(doc(db, "posts", selectedPostDetail.id), {
        comments: finalComments,
      });
    } catch (error) {
      console.error("留言按讚失敗:", error);

      updatePostInLocalState(selectedPostDetail);

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
    拍照留言
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
    發送期間鎖定按鈕並顯示 Loading。
  */
  const handleAddComment = async () => {
    if (isSendingCommentRef.current) {
      return;
    }

    if (!selectedPostDetail) {
      return;
    }

    const trimmedText = commentText.trim();

    if (!trimmedText && !commentImage) {
      Alert.alert("請輸入留言或加上照片");

      return;
    }

    if (!deviceId) {
      Alert.alert("使用者資料尚未載入完成");

      return;
    }
    Keyboard.dismiss();
    isSendingCommentRef.current = true;
    setIsSendingComment(true);

    try {
      const oldComments = Array.isArray(selectedPostDetail.comments)
        ? selectedPostDetail.comments
        : [];

      const postOwnerId =
        selectedPostDetail.authorId || selectedPostDetail.deviceId || null;

      let imageUrl: string | undefined;

      if (commentImage) {
        imageUrl = await uploadCommentImageAsync(commentImage);
      }

      const newComment = {
        id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: trimmedText,
        userId: deviceId,
        userName: userId || "匿名小夥伴",
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

        /*
          自己留言自己的貼文：
          本機花園立即成長。
        */
        if (postOwnerId && postOwnerId === deviceId) {
          // 自己回覆自己的貼文：不觸發植物成長，也不會給水滴
        } else if (selectedPostDetail.id) {
          // 回覆別人的貼文：記錄作者尚未領取的成長次數，並給予水滴
          await updateDoc(doc(db, "posts", selectedPostDetail.id), {
            pendingGrowth: increment(1),
          });

          const globalData = await getGlobalData();
          const newWaterDrops = (globalData.waterDrops || 0) + 3;
          await updateGlobalData({ waterDrops: newWaterDrops });
        }
      } catch (gardenError) {
        console.error("更新花園成長失敗:", gardenError);
      }

      

      const updatedPost = {
        ...selectedPostDetail,
        comments: updatedComments,
      };

      updatePostInLocalState(updatedPost);

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
    抓取統計與貼文資料
  */
  const fetchUserStats = async (id: string) => {
    try {
      const postsQuery = query(collection(db, "posts"));
      const postsSnapshot = await getDocs(postsQuery);

      const repliesQuery = query(
        collection(db, "replies"),
        where("fromDeviceId", "==", id),
      );

      const repliesSnapshot = await getDocs(repliesQuery);

      let sentPosts = 0;
      let sentComments = repliesSnapshot.size;
      let receivedComments = 0;

      const fetchedMyPosts: any[] = [];
      const fetchedSavedPosts: any[] = [];

      postsSnapshot.forEach((documentSnapshot) => {
        const post = {
          id: documentSnapshot.id,
          ...(documentSnapshot.data() as any),
        };

        const isMyPost = post.authorId === id || post.deviceId === id;

        if (isMyPost) {
          sentPosts += 1;

          fetchedMyPosts.push(post);

          const comments = Array.isArray(post.comments) ? post.comments : [];

          comments.forEach((comment: any) => {
            if (comment.userId !== id) {
              receivedComments += 1;
            }
          });
        } else {
          const comments = Array.isArray(post.comments) ? post.comments : [];

          comments.forEach((comment: any) => {
            if (comment.userId === id) {
              sentComments += 1;
            }
          });
        }

        if (Array.isArray(post.savedBy) && post.savedBy.includes(id)) {
          fetchedSavedPosts.push(post);
        }
      });

      setStats({
        sentPosts,
        sentComments,
        receivedComments,
      });

      setMyPosts(fetchedMyPosts);
      setFavoritePosts(fetchedSavedPosts);

      setPostDays(getPostDaysFromPosts(fetchedMyPosts));
    } catch (error) {
      console.error("[Profile] Stats error:", error);
    }
  };

  const formatDayKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;

  const parsePostDate = (createdAt: any) => {
    if (!createdAt) {
      return null;
    }

    if (createdAt.toDate) {
      return createdAt.toDate();
    }

    return new Date(createdAt);
  };

  const getPostThumbnailUrl = (post: any) => {
    if (post.imageUri) {
      return post.imageUri;
    }

    if (post.media?.type === "photo" || post.media?.type === "image") {
      return post.media.url;
    }

    if (post.thumbnailUrl) {
      return post.thumbnailUrl;
    }

    return null;
  };

  const getPostDaysFromPosts = (posts: any[]) => {
    const days: Record<string, boolean> = {};

    posts.forEach((post) => {
      const createdAt = parsePostDate(post.createdAt);

      if (!createdAt) {
        return;
      }

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

      for (let index = 0; index < 7; index += 1) {
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

  const selectedCalendarDayPosts = useMemo(() => {
    if (!selectedCalendarDay) {
      return [];
    }

    return myPosts
      .filter((post) => {
        const createdAt = parsePostDate(post.createdAt);

        return createdAt && formatDayKey(createdAt) === selectedCalendarDay;
      })
      .sort((firstPost, secondPost) => {
        const firstDate = parsePostDate(firstPost.createdAt) || new Date(0);

        const secondDate = parsePostDate(secondPost.createdAt) || new Date(0);

        return firstDate.getTime() - secondDate.getTime();
      });
  }, [selectedCalendarDay, myPosts]);

  useFocusEffect(
    useCallback(() => {
      if (!deviceId) {
        return;
      }

      const updateData = async () => {
        try {
          const profileReference = doc(collection(db, "profiles"), deviceId);

          const profileSnapshot = await getDoc(profileReference);

          if (profileSnapshot.exists()) {
            const data = profileSnapshot.data();

            if (data.avatarUrl) {
              setAvatar(data.avatarUrl);
            }

            const localId = await AsyncStorage.getItem("userId");

            const finalId = data.userId || localId || deviceId;

            setUserId(finalId);
            setTempId(finalId);
          }

          await fetchUserStats(deviceId);
        } catch (error) {
          console.error("刷新資料失敗:", error);
        } finally {
          setLoading(false);
        }
      };

      updateData();
    }, [deviceId]),
  );

  const uploadAvatar = async (uri: string) => {
    if (!deviceId) {
      return;
    }

    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const filename = `avatars/${deviceId}_${Date.now()}.jpg`;

      const storageReference = ref(storage, filename);

      await uploadBytes(storageReference, blob);

      const url = await getDownloadURL(storageReference);

      try {
        const profileReference = doc(collection(db, "profiles"), deviceId);

        const profileSnapshot = await getDoc(profileReference);

        if (profileSnapshot.exists()) {
          const data = profileSnapshot.data();

          if (data.pendingFertilizers === undefined) {
            await setDoc(
              profileReference,
              {
                pendingFertilizers: 0,
              },
              {
                merge: true,
              },
            );
          }
        } else {
          await setDoc(
            profileReference,
            {
              pendingFertilizers: 0,
            },
            {
              merge: true,
            },
          );
        }
      } catch (error) {
        console.error("初始化 pendingFertilizers 失敗:", error);
      }

      await setDoc(
        doc(collection(db, "profiles"), deviceId),
        {
          avatarUrl: url,
        },
        {
          merge: true,
        },
      );

      setAvatar(url);

      Alert.alert("更新成功");
    } catch (error) {
      console.error("上傳頭像失敗:", error);

      Alert.alert("上傳失敗");
    }
  };

  const handleEditAvatar = () => {
    Alert.alert("更換頭像", "選擇照片來源", [
      {
        text: "相簿",
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
          });

          if (!result.canceled) {
            uploadAvatar(result.assets[0].uri);
          }
        },
      },
      {
        text: "取消",
        style: "cancel",
      },
    ]);
  };

  const saveId = async (newId: string) => {
    if (newId.trim().length === 0) {
      return;
    }

    setUserId(newId);
    setEditingId(false);

    try {
      await AsyncStorage.setItem("userId", newId);

      if (deviceId) {
        try {
          const profileReference = doc(collection(db, "profiles"), deviceId);

          const profileSnapshot = await getDoc(profileReference);

          if (profileSnapshot.exists()) {
            const data = profileSnapshot.data();

            if (data.pendingFertilizers === undefined) {
              await setDoc(
                profileReference,
                {
                  pendingFertilizers: 0,
                },
                {
                  merge: true,
                },
              );
            }
          } else {
            await setDoc(
              profileReference,
              {
                pendingFertilizers: 0,
              },
              {
                merge: true,
              },
            );
          }
        } catch (error) {
          console.error("初始化 pendingFertilizers 失敗:", error);
        }

        await setDoc(
          doc(collection(db, "profiles"), deviceId),
          {
            userId: newId,
          },
          {
            merge: true,
          },
        );
      }
    } catch (error) {
      console.error("儲存暱稱失敗:", error);
    }

    Keyboard.dismiss();
  };

  /*
    三個入口統一使用同一個函式開啟詳情：
    - 時間順序
    - 月曆
    - 收藏頁
  */
  const openPostDetail = (post: any) => {
    setSelectedPostDetail(post);
    setCommentSortMode("new");
    setCommentText("");
    setCommentImage(null);
    setDetailVisible(true);
  };

  const sectionUnderlineTranslateX = sectionUnderlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, sectionTabsWidth / 2],
  });

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4630EB" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.containerContent}
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
            <MaterialIcons name="edit" size={14} color="#666666" />
          </TouchableOpacity>
        </View>

        {/* 使用者名稱 */}
        <View style={styles.nameRow}>
          <View style={styles.namePlaceholder} />

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

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setEditingId(true)}
          >
            <MaterialIcons name="edit" size={18} color="#999999" />
          </TouchableOpacity>
        </View>

        {/* 統計數字 */}
        <View style={styles.statBox}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>貼文</Text>

            <View style={styles.statValueContainer}>
              <Animated.View
                style={[
                  styles.statValueWrapper,
                  {
                    transform: [
                      {
                        translateY: sentPostsSlideAnim,
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.statValue}>{prevStats.sentPosts}</Text>

                <Text style={styles.statValue}>{stats.sentPosts}</Text>
              </Animated.View>
            </View>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>給出回覆</Text>

            <View style={styles.statValueContainer}>
              <Animated.View
                style={[
                  styles.statValueWrapper,
                  {
                    transform: [
                      {
                        translateY: sentCommentsSlideAnim,
                      },
                    ],
                  },
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
                  {
                    transform: [
                      {
                        translateY: receivedCommentsSlideAnim,
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.statValue}>
                  {prevStats.receivedComments}
                </Text>

                <Text style={styles.statValue}>{stats.receivedComments}</Text>
              </Animated.View>
            </View>
          </View>
        </View>

        {/* 貼文頁與收藏頁 */}
        <View
          style={styles.sectionTabs}
          onLayout={(event) => {
            setSectionTabsWidth(event.nativeEvent.layout.width);
          }}
        >
          <TouchableOpacity
            style={styles.sectionTab}
            activeOpacity={0.7}
            onPress={() => {
              setActiveSection("posts");
            }}
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
            style={styles.sectionTab}
            activeOpacity={0.7}
            onPress={() => {
              setActiveSection("favorites");
            }}
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

          {sectionTabsWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sectionUnderline,
                {
                  width: sectionTabsWidth / 2,
                  transform: [
                    {
                      translateX: sectionUnderlineTranslateX,
                    },
                  ],
                },
              ]}
            />
          ) : null}
        </View>

        {activeSection === "posts" ? (
          <>
            <View style={styles.viewTabs}>
              <TouchableOpacity
                style={[
                  styles.viewTab,
                  postViewMode === "time" && styles.viewTabActive,
                ]}
                onPress={() => {
                  setPostViewMode("time");
                }}
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
                onPress={() => {
                  setPostViewMode("calendar");
                }}
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
                    .sort((firstPost, secondPost) => {
                      const firstDate =
                        parsePostDate(firstPost.createdAt) || new Date(0);

                      const secondDate =
                        parsePostDate(secondPost.createdAt) || new Date(0);

                      return secondDate.getTime() - firstDate.getTime();
                    })
                    .map((post) => (
                      <TouchableOpacity
                        key={post.id}
                        style={styles.postRow}
                        onPress={() => {
                          openPostDetail(post);
                        }}
                      >
                        <View style={styles.postRowHeader}>
                          <Image
                            source={
                              post.authorAvatar
                                ? {
                                    uri: post.authorAvatar,
                                  }
                                : require("../../assets/avatar-placeholder.png")
                            }
                            style={styles.postRowAvatar}
                          />

                          <View style={styles.postRowAuthorInfo}>
                            <Text style={styles.postRowName} numberOfLines={1}>
                              {profileMap[post.authorId || post.deviceId]
                                ?.name ||
                                post.authorName ||
                                post.userId ||
                                userId}
                            </Text>

                            <View style={styles.postRowMetaRow}>
                              <Text style={styles.postRowDate}>
                                {parsePostDate(post.createdAt)
                                  ? parsePostDate(
                                      post.createdAt,
                                    ).toLocaleDateString("zh-TW", {
                                      year: "numeric",
                                      month: "2-digit",
                                      day: "2-digit",
                                    })
                                  : "未知時間"}
                              </Text>
                            </View>
                          </View>
                        </View>
                        {(post.tags && post.tags.length > 0) || post.tag ? (
                          <View style={styles.postRowTagBadge}>
                            <Text
                              style={styles.postRowTagText}
                              numberOfLines={1}
                            >
                              #{post.tags?.[0] || post.tag}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.postRowContentRow}>
                          <Text
                            style={[
                              styles.postRowContent,
                              styles.postRowContentWithImage,
                            ]}
                            numberOfLines={1}
                          >
                            {post.content || post.text || "(無內容)"}
                          </Text>

                          {getPostThumbnailUrl(post) ? (
                            <Image
                              source={{
                                uri: getPostThumbnailUrl(post),
                              }}
                              style={styles.postRowThumbnail}
                            />
                          ) : null}
                        </View>
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
                    {/* 頭貼、名稱、日期 */}
                    <View style={styles.postRowHeader}>
                      <Image
                        source={
                          post.authorAvatar
                            ? { uri: post.authorAvatar }
                            : require("../../assets/avatar-placeholder.png")
                        }
                        style={styles.postRowAvatar}
                      />

                      <View style={styles.postRowAuthorInfo}>
                        <Text style={styles.postRowName} numberOfLines={1}>
                          {profileMap[post.authorId || post.deviceId]?.name ||
                            post.authorName ||
                            post.userId ||
                            userId}
                        </Text>

                        <Text style={styles.postRowDate}>
                          {parsePostDate(post.createdAt)
                            ? parsePostDate(post.createdAt).toLocaleDateString(
                                "zh-TW",
                                {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                },
                              )
                            : "未知時間"}
                        </Text>
                      </View>
                    </View>

                    {/* 標籤移到頭貼區塊下方 */}
                    {(post.tags && post.tags.length > 0) || post.tag ? (
                      <View style={styles.postRowTagBadge}>
                        <Text style={styles.postRowTagText} numberOfLines={1}>
                          #{post.tags?.[0] || post.tag}
                        </Text>
                      </View>
                    ) : null}

                    {/* 貼文內文與縮圖 */}
                    <View style={styles.postRowContentRow}>
                      <Text
                        style={[
                          styles.postRowContent,
                          styles.postRowContentWithImage,
                        ]}
                        numberOfLines={1}
                      >
                        {post.content || post.text || "(無內容)"}
                      </Text>

                      {getPostThumbnailUrl(post) ? (
                        <Image
                          source={{
                            uri: getPostThumbnailUrl(post),
                          }}
                          style={styles.postRowThumbnail}
                        />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))
            )}
          </View>
        )}

        {/* 月曆 */}
        {activeSection === "posts" && postViewMode === "calendar" ? (
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() => {
                  setCalendarMonth(
                    (previousMonth) =>
                      new Date(
                        previousMonth.getFullYear(),
                        previousMonth.getMonth() - 1,
                        1,
                      ),
                  );

                  setSelectedCalendarDay(null);
                }}
              >
                <MaterialIcons name="chevron-left" size={24} color="#333333" />
              </TouchableOpacity>

              <Text style={styles.calendarTitle}>
                {calendarMonth.toLocaleDateString("zh-TW", {
                  year: "numeric",
                  month: "long",
                })}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  setCalendarMonth(
                    (previousMonth) =>
                      new Date(
                        previousMonth.getFullYear(),
                        previousMonth.getMonth() + 1,
                        1,
                      ),
                  );

                  setSelectedCalendarDay(null);
                }}
              >
                <MaterialIcons name="chevron-right" size={24} color="#333333" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {["日", "一", "二", "三", "四", "五", "六"].map((label) => (
                <Text key={label} style={styles.weekdayText}>
                  {label}
                </Text>
              ))}
            </View>

            {getMonthMatrix(calendarMonth).map((week, weekIndex) => (
              <View key={`week-${weekIndex}`} style={styles.weekRow}>
                {week.map((day, dayIndex) => {
                  const dayKey =
                    day !== null
                      ? formatDayKey(
                          new Date(
                            calendarMonth.getFullYear(),
                            calendarMonth.getMonth(),
                            day,
                          ),
                        )
                      : "";

                  const hasPost = day !== null && !!postDays[dayKey];

                  const today =
                    day !== null &&
                    day === new Date().getDate() &&
                    calendarMonth.getMonth() === new Date().getMonth() &&
                    calendarMonth.getFullYear() === new Date().getFullYear();

                  const isSelected = hasPost && dayKey === selectedCalendarDay;

                  return (
                    <View key={`day-${dayIndex}`} style={styles.dayCell}>
                      {day !== null ? (
                        <TouchableOpacity
                          style={styles.dayInner}
                          disabled={!hasPost}
                          onPress={() => {
                            if (!hasPost) {
                              return;
                            }

                            setSelectedCalendarDay(dayKey);
                          }}
                        >
                          {hasPost ? (
                            <Image
                              source={require("../../assets/day flower.png")}
                              style={styles.moodIcon}
                            />
                          ) : null}

                          <View
                            style={[
                              styles.dayTextWrapper,
                              isSelected && styles.selectedDayWrapper,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                today && styles.todayDayText,
                                hasPost && styles.dayTextWithPost,
                              ]}
                            >
                              {day}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.emptyDay} />
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

            {selectedCalendarDay ? (
              <View style={styles.selectedDayPosts}>
                <Text style={styles.selectedDayPostsTitle}>
                  {new Date(
                    `${selectedCalendarDay}T00:00:00`,
                  ).toLocaleDateString("zh-TW", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })}{" "}
                  的貼文
                </Text>

                {selectedCalendarDayPosts.length === 0 ? (
                  <Text style={styles.emptyText}>該日尚無貼文</Text>
                ) : (
                  selectedCalendarDayPosts.map((post) => (
                    <TouchableOpacity
                      key={post.id}
                      style={styles.calendarPostRow}
                      onPress={() => {
                        openPostDetail(post);
                      }}
                    >
                      <View style={styles.calendarPostLeft}>
                        <Image
                          source={
                            post.authorAvatar
                              ? {
                                  uri: post.authorAvatar,
                                }
                              : require("../../assets/avatar-placeholder.png")
                          }
                          style={styles.calendarPostAvatar}
                        />
                      </View>

                      <View style={styles.calendarPostContent}>
                        <View style={styles.calendarPostHeader}>
                          <Text
                            style={styles.calendarPostUserName}
                            numberOfLines={1}
                          >
                            {post.authorName || post.userId || userId}
                          </Text>

                          <Text style={styles.calendarPostDate}>
                            {parsePostDate(post.createdAt)?.toLocaleTimeString(
                              "zh-TW",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            ) || "未知時間"}
                          </Text>
                        </View>

                        {(post.tags && post.tags.length > 0) || post.tag ? (
                          <Text
                            style={styles.calendarPostTag}
                            numberOfLines={1}
                          >
                            #{post.tags?.[0] || post.tag}
                          </Text>
                        ) : null}

                        <Text
                          style={[
                            styles.calendarPostText,
                            styles.calendarPostTextWithImage,
                          ]}
                          numberOfLines={1}
                        >
                          {post.content || post.text || "(無內容)"}
                        </Text>
                      </View>

                      {getPostThumbnailUrl(post) ? (
                        <Image
                          source={{
                            uri: getPostThumbnailUrl(post),
                          }}
                          style={styles.calendarPostThumbnail}
                        />
                      ) : null}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/*
        共用首頁同一個貼文詳情 Modal。
        放在 contentCard 外部，避免被統計卡片結構包住。
      */}
      <PostDetailModal
        visible={detailVisible}
        post={selectedPostDetail}
        onClose={() => {
          setDetailVisible(false);
          setSelectedPostDetail(null);
          setCommentText("");
          setCommentImage(null);
        }}
        currentUserId={deviceId || ""}
        onLikePost={handleLikePost}
        onSavePost={handleSavePost}
        onDeletePost={handleDeletePost}
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
                  onPress={() => {
                    setCommentImage(null);
                  }}
                  disabled={isSendingComment}
                >
                  <Ionicons
                    name="close-circle"
                    size={24}
                    color={isSendingComment ? "#bbbbbb" : "#E07A7A"}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F3EC",
  },

  containerContent: {
    flexGrow: 1,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  topSection: {
    height: 200,
  },

  contentCard: {
    flex: 1,
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 25,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 10,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },

  avatarWrapper: {
    position: "absolute",
    top: -55,
    padding: 3,
    backgroundColor: "#ffffff",
    borderRadius: 60,
    elevation: 5,
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },

  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },

  avatarEditIcon: {
    position: "absolute",
    right: 5,
    bottom: 5,
    padding: 3,
    backgroundColor: "#eeeeee",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cccccc",
  },

  nameRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 45,
  },

  namePlaceholder: {
    width: 40,
  },

  centerNameArea: {
    flex: 1,
    alignItems: "center",
  },

  nameText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333333",
  },

  nameInput: {
    width: 100,
    fontSize: 20,
    fontWeight: "bold",
    color: "#333333",
    textAlign: "center",
    borderBottomWidth: 1,
  },

  editButton: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  statBox: {
    width: "100%",
    flexDirection: "row",
    paddingVertical: 20,
    marginBottom: 15,
    backgroundColor: "#F0F4EC",
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  statItem: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },

  statLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "bold",
    color: "#333333",
  },

  statValueContainer: {
    height: 40,
    overflow: "hidden",
  },

  statValueWrapper: {
    height: 80,
    justifyContent: "space-around",
  },

  statValue: {
    fontSize: 32,
    fontWeight: "300",
    color: "#777",
  },

  sectionTabs: {
    position: "relative",
    width: "100%",
    flexDirection: "row",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E7E2D9",
  },

  sectionTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
  },

  sectionTabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#999999",
  },

  sectionTabTextActive: {
    color: "#777",
    fontWeight: "700",
  },

  sectionUnderline: {
    position: "absolute",
    left: 0,
    bottom: -1,
    height: 3,
    backgroundColor: "#777",
    borderRadius: 3,
  },

  viewTabs: {
    width: "100%",
    flexDirection: "row",
    marginBottom: 12,
  },

  viewTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginRight: 8,
    backgroundColor: "#F0F4EC",
    borderRadius: 16,
  },

  viewTabActive: {
    backgroundColor: "#B1D497",
  },

  viewTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666666",
  },

  viewTabTextActive: {
    color: "#ffffff",
  },

  listCard: {
    width: "100%",
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  postRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },

  postRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  postRowAvatar: {
    width: 40,
    height: 40,
    marginRight: 10,
    backgroundColor: "#dddddd",
    borderRadius: 20,
  },

  postRowAuthorInfo: {
    flex: 1,
  },

  postRowName: {
    marginBottom: 4,
    fontSize: 14,
    fontWeight: "700",
    color: "#333333",
  },

  postRowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },

  postRowDate: {
    fontSize: 12,
    color: "#999999",
  },

  postRowTagBadge: {
    alignSelf: "flex-start",
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#F0F4EC",
    borderRadius: 14,
  },

  postRowTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#777",
  },

  postRowContentRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  postRowContent: {
    flex: 1,
    fontSize: 15,
    color: "#333333",
    lineHeight: 20,
  },

  postRowContentWithImage: {
    marginRight: 10,
  },

  postRowThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },

  emptyText: {
    paddingVertical: 24,
    fontSize: 14,
    color: "#888888",
    textAlign: "center",
  },

  calendarCard: {
    width: "100%",
    padding: 16,
    marginBottom: 20,
    backgroundColor: "#F0F4EC",
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    color: "#333333",
  },

  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: -16,
  },

  weekdayText: {
    width: (width - 50) / 7,
    fontSize: 12,
    color: "#999999",
    textAlign: "center",
  },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: -16,
  },

  dayCell: {
    width: (width - 50) / 7,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },

  dayInner: {
    position: "relative",
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  dayTextWrapper: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },

  selectedDayWrapper: {
    backgroundColor: "rgba(123, 112, 201, 0.15)",
  },

  dayText: {
    zIndex: 2,
    fontSize: 14,
    color: "#333333",
  },

  dayTextWithPost: {
    fontWeight: "700",
    color: "#6f5b00",
  },

  todayDayText: {
    fontWeight: "700",
    color: "#B1D497",
  },

  emptyDay: {
    width: (width - 50) / 7,
    height: 50,
  },

  moodIcon: {
    position: "absolute",
    zIndex: 1,
    width: 38,
    height: 38,
    resizeMode: "contain",
  },

  selectedDayPosts: {
    padding: 12,
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
  },

  selectedDayPostsTitle: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#333333",
  },

  calendarPostRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },

  calendarPostLeft: {
    marginRight: 10,
  },

  calendarPostAvatar: {
    width: 42,
    height: 42,
    backgroundColor: "#dddddd",
    borderRadius: 21,
  },

  calendarPostContent: {
    flex: 1,
  },

  calendarPostHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  calendarPostUserName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#333333",
  },

  calendarPostDate: {
    marginLeft: 8,
    fontSize: 12,
    color: "#999999",
  },

  calendarPostTag: {
    marginBottom: 4,
    fontSize: 12,
    color: "#6f5b00",
  },

  calendarPostText: {
    fontSize: 14,
    color: "#444444",
  },

  calendarPostTextWithImage: {
    marginRight: 10,
  },

  calendarPostThumbnail: {
    width: 64,
    height: 64,
    marginLeft: 10,
    backgroundColor: "#dddddd",
    borderRadius: 12,
  },

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
    backgroundColor: "#F0F4EC",
  },
});
