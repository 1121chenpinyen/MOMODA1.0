import { useThemeMode } from "@/context/themeContext";

export function useColorScheme() {
  const { theme } = useThemeMode();

  return theme;
}
