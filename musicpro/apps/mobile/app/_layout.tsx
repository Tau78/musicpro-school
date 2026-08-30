import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "@/contexts/AuthContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Accedi" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="calendario-lezioni" options={{ title: "Calendario" }} />
        <Stack.Screen
          name="mie-prenotazioni"
          options={{ title: "Le mie prenotazioni" }}
        />
      </Stack>
    </AuthProvider>
  );
}
