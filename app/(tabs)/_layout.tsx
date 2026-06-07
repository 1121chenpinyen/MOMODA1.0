import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Link, Tabs } from "expo-router";
import React from "react";
import { Image, Pressable, View } from "react-native";

import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}
const homeicon = require("../../assets/homeicon.png");
const peticon = require("../../assets/peticon.png");
const profileicon = require("../../assets/profileicon.png");

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#C1946D", // 選取時的文字顏色
        tabBarInactiveTintColor: "#dab99d", // 未選取時的文字顏色
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            // --- 修改這裡的 View 樣式 ---
            <View
              style={{
                width: 60, // 設定適合的大小
                height: 28,
                overflow: "hidden", // 確保圖片不超出
                opacity: focused ? 1 : 0.6,
              }}
            >
              <Image
                source={homeicon}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                resizeMode="cover" // 確保圖片填滿
              />
            </View>
          ),
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="info-circle"
                    size={25}
                    color={Colors[colorScheme ?? "light"].text}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="garden"
        options={{
          title: "Garden",
          tabBarIcon: ({ focused }) => (
            // --- 修改這裡的 View 樣式 ---
            <View
              style={{
                width: 60, // 設定適合的大小
                height: 28,
                overflow: "hidden", // 確保圖片不超出
                opacity: focused ? 1 : 0.6,
              }}
            >
              <Image
                source={peticon}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                resizeMode="cover" // 確保圖片填滿
              />
            </View>
          ),
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="info-circle"
                    size={25}
                    color={Colors[colorScheme ?? "light"].text}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            // --- 修改這裡的 View 樣式 ---
            <View
              style={{
                width: 60, // 設定適合的大小
                height: 28,
                overflow: "hidden", // 確保圖片不超出
                opacity: focused ? 1 : 0.6,
              }}
            >
              <Image
                source={profileicon}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                resizeMode="cover" // 確保圖片填滿
              />
            </View>
          ),
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="info-circle"
                    size={25}
                    color={Colors[colorScheme ?? "light"].text}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="notification"
        options={{
          title: "通知",
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 60,
                height: 28,
                overflow: "hidden",
                opacity: focused ? 1 : 0.6,
              }}
            >
              <Image
                source={require("../../assets/notificationicon.png")}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                resizeMode="cover"
              />
            </View>
          ),
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="info-circle"
                    size={25}
                    color={Colors[colorScheme ?? "light"].text}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
    </Tabs>
  );
}
