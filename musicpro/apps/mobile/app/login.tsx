import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { APP_NAME } from "@musicpro/shared";

import { useAuth } from "@/contexts/AuthContext";

export default function LoginScreen() {
  const {
    isLoading,
    isBiometricUnlockRequired,
    signIn,
    unlockWithBiometrics,
    signOut,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setIsSubmitting(true);

    const message = await signIn({ email, password });

    if (message) {
      setError(message);
    }

    setIsSubmitting(false);
  }

  async function handleBiometricUnlock() {
    setError(null);
    const unlocked = await unlockWithBiometrics();

    if (!unlocked) {
      setError("Sblocco biometrico non riuscito. Accedi con email e password.");
    }
  }

  async function handleUsePasswordInstead() {
    await signOut();
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
        <Text style={styles.loadingText}>Caricamento…</Text>
      </View>
    );
  }

  if (isBiometricUnlockRequired) {
    return (
      <View style={styles.centered}>
        <View style={styles.card}>
          <Text style={styles.brand}>{APP_NAME}</Text>
          <Text style={styles.title}>Sblocco rapido</Text>
          <Text style={styles.subtitle}>
            Usa Face ID o impronta per accedere all&apos;area personale.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.button} onPress={handleBiometricUnlock}>
            <Text style={styles.buttonText}>Sblocca con biometria</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={handleUsePasswordInstead}>
            <Text style={styles.secondaryButtonText}>Usa email e password</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Text style={styles.title}>Accedi</Text>
        <Text style={styles.subtitle}>
          Area riservata associati — email e password Supabase.
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="nome@esempio.it"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>
            {isSubmitting ? "Accesso in corso…" : "Accedi"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#fafafa",
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#fafafa",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  brand: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#c9a227",
  },
  title: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  label: {
    marginTop: 20,
    fontSize: 14,
    fontWeight: "500",
    color: "#444",
  },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  button: {
    marginTop: 24,
    backgroundColor: "#1e3a5f",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d4d4d4",
  },
  secondaryButtonText: {
    color: "#1e3a5f",
    fontSize: 14,
    fontWeight: "500",
  },
  error: {
    marginTop: 16,
    fontSize: 13,
    color: "#b91c1c",
    lineHeight: 18,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
});
