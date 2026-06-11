import { Stack } from "expo-router";
import { MoneyProvider } from "../context/moneyContext";
import { ThemeProvider } from "../context/themeContext";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <MoneyProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="encyclopedia" options={{ headerShown: false }} />
        </Stack>
      </MoneyProvider>
    </ThemeProvider>
  );
}
