import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "YAHU_THEME_MODE";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemTheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>(
    systemTheme === "dark" ? "dark" : "light",
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (!active) return;

        if (storedTheme === "light" || storedTheme === "dark") {
          setThemeState(storedTheme);
        } else if (systemTheme === "dark") {
          setThemeState("dark");
        }
      } catch (error) {
        console.error("載入主題失敗:", error);
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    };

    loadTheme();

    return () => {
      active = false;
    };
  }, [systemTheme]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme).catch((error) => {
      console.error("儲存主題失敗:", error);
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((previousTheme) => {
      const nextTheme = previousTheme === "dark" ? "light" : "dark";
      AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme).catch((error) => {
        console.error("儲存主題失敗:", error);
      });
      return nextTheme;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === "dark",
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme],
  );

  if (!hydrated) {
    return (
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  const systemTheme = useSystemColorScheme();

  if (!context) {
    return {
      theme: (systemTheme === "dark" ? "dark" : "light") as ThemeMode,
      isDark: systemTheme === "dark",
      setTheme: (_theme: ThemeMode) => {},
      toggleTheme: () => {},
    };
  }

  return context;
}

export { ThemeContext };

