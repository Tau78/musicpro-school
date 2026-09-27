import { Link, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";

import { APP_NAME, MemberRole } from "@musicpro/shared";

import { useAuth } from "@/contexts/AuthContext";
import { theme } from "@/lib/theme";

function GearButton() {
  return (
    <Link href="/impostazioni" asChild>
      <Pressable
        accessibilityLabel="Impostazioni"
        style={{ marginRight: 16, padding: 4 }}
      >
        <Ionicons name="settings-outline" size={22} color={theme.brand} />
      </Pressable>
    </Link>
  );
}

export default function TabsLayout() {
  const { roles } = useAuth();
  const isDocente = roles.includes(MemberRole.Docente);
  const isAssociato = roles.includes(MemberRole.Associato);
  const isTutore = roles.includes(MemberRole.Tutore);
  const showLezioni = isDocente || isAssociato || isTutore;

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: "rgba(255, 255, 255, 0.72)",
        },
        headerTintColor: theme.brand,
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: "#999",
        tabBarStyle: {
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderTopColor: "rgba(255, 255, 255, 0.85)",
        },
        sceneStyle: { backgroundColor: theme.gradientBottom },
        headerRight: () => <GearButton />,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Area personale",
          headerTitle: APP_NAME,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="prenotazioni"
        options={{
          title: "Prenotazioni",
          headerTitle: APP_NAME,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <>
              <Link href="/mie-prenotazioni" asChild>
                <Pressable style={{ marginRight: 12 }}>
                  <Text style={{ color: theme.brand, fontSize: 14, fontWeight: "500" }}>
                    Le mie
                  </Text>
                </Pressable>
              </Link>
              <GearButton />
            </>
          ),
        }}
      />
      <Tabs.Screen
        name="lezioni"
        options={{
          title: "Lezioni",
          headerTitle: APP_NAME,
          href: showLezioni ? "/(tabs)/lezioni" : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="musical-notes-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="area-personale"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
