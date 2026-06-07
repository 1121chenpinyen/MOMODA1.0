import { Stack } from 'expo-router';
import { MoneyProvider } from '../context/moneyContext';

export default function RootLayout() {
  return (
    <MoneyProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </MoneyProvider>
  );
}