import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { session, isLoading, isBiometricUnlockRequired } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e3a5f" />
        <Text style={styles.text}>Caricamento…</Text>
      </View>
    );
  }

  if (session && !isBiometricUnlockRequired) {
    return <Redirect href="/(tabs)/area-personale" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
});
