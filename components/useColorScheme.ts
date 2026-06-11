import { useColorScheme as useSystemColorScheme } from "react-native";

import { useThemeMode } from "@/context/themeContext";

export function useColorScheme() {
  const { theme } = useThemeMode();
  const systemTheme = useSystemColorScheme();

  return theme ?? (systemTheme === "dark" ? "dark" : "light");
}
