import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useRouter, useSegments } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getCurrentMemberWithRoles,
  getSession,
} from "@musicpro/database";
import type { AuthState, MemberWithRoles, SignInCredentials } from "@musicpro/shared";

import { createClient } from "@/lib/supabase";

const BIOMETRIC_ENABLED_KEY = "musicpro_biometric_enabled";

type AuthContextValue = AuthState & {
  member: MemberWithRoles | null;
  signIn: (credentials: SignInCredentials) => Promise<string | null>;
  signOut: () => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  enableBiometricUnlock: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<AuthState["session"]>(null);
  const [member, setMember] = useState<MemberWithRoles | null>(null);
  const [roles, setRoles] = useState<AuthState["roles"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBiometricUnlockRequired, setIsBiometricUnlockRequired] =
    useState(false);

  const refreshProfile = useCallback(async () => {
    const profile = await getCurrentMemberWithRoles(supabase);

    if (!profile) {
      setMember(null);
      setRoles([]);
      return null;
    }

    setMember(profile);
    setRoles(profile.roles);
    return profile;
  }, [supabase]);

  const loadSession = useCallback(async () => {
    const nextSession = await getSession(supabase);
    setSession(nextSession);

    if (!nextSession) {
      setMember(null);
      setRoles([]);
      return;
    }

    await refreshProfile();
  }, [refreshProfile, supabase]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      setIsLoading(true);

      const nextSession = await getSession(supabase);

      if (!isMounted) {
        return;
      }

      setSession(nextSession);

      if (!nextSession) {
        setMember(null);
        setRoles([]);
        setIsBiometricUnlockRequired(false);
        setIsLoading(false);
        return;
      }

      const biometricEnabled =
        (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === "true";

      if (biometricEnabled) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (hasHardware && isEnrolled) {
          setIsBiometricUnlockRequired(true);
          setIsLoading(false);
          return;
        }
      }

      await refreshProfile();
      setIsBiometricUnlockRequired(false);
      setIsLoading(false);
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextAuthSession) => {
      if (!isMounted) {
        return;
      }

      if (!nextAuthSession) {
        setSession(null);
        setMember(null);
        setRoles([]);
        setIsBiometricUnlockRequired(false);
        return;
      }

      setSession({
        accessToken: nextAuthSession.access_token,
        refreshToken: nextAuthSession.refresh_token,
        expiresAt: nextAuthSession.expires_at ?? null,
        user: {
          id: nextAuthSession.user.id,
          email: nextAuthSession.user.email ?? null,
        },
      });

      await refreshProfile();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile, supabase]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const inAuthGroup = segments[0] === "login";

    if (!session && !inAuthGroup) {
      router.replace("/login");
      return;
    }

    if (session && !isBiometricUnlockRequired && inAuthGroup) {
      router.replace("/(tabs)/area-personale");
    }
  }, [isBiometricUnlockRequired, isLoading, router, segments, session]);

  const signIn = useCallback(
    async ({ email, password }: SignInCredentials) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return error.message;
      }

      const profile = await getCurrentMemberWithRoles(supabase);

      if (!profile) {
        await supabase.auth.signOut();
        return "Nessun profilo associato trovato per questa email. Contatta la segreteria.";
      }

      setSession(await getSession(supabase));
      setMember(profile);
      setRoles(profile.roles);

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
      }

      setIsBiometricUnlockRequired(false);
      return null;
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    setSession(null);
    setMember(null);
    setRoles([]);
    setIsBiometricUnlockRequired(false);
    router.replace("/login");
  }, [router, supabase]);

  const unlockWithBiometrics = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Sblocca MusicPro School",
      cancelLabel: "Usa password",
      fallbackLabel: "Usa password",
    });

    if (!result.success) {
      return false;
    }

    await refreshProfile();
    setIsBiometricUnlockRequired(false);
    return true;
  }, [refreshProfile]);

  const enableBiometricUnlock = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      member,
      roles,
      isLoading,
      isBiometricUnlockRequired,
      signIn,
      signOut,
      unlockWithBiometrics,
      enableBiometricUnlock,
    }),
    [
      isBiometricUnlockRequired,
      isLoading,
      member,
      roles,
      session,
      signIn,
      signOut,
      unlockWithBiometrics,
      enableBiometricUnlock,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
