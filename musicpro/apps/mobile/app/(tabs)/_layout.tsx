import { Link, Tabs } from "expo-router";
import { Pressable, Text } from "react-native";

import { APP_NAME, MemberRole } from "@musicpro/shared";

import { useAuth } from "@/contexts/AuthContext";

export default function TabsLayout() {
  const { roles } = useAuth();
  const isDocente = roles.includes(MemberRole.Docente);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#1e3a5f" },
        headerTintColor: "#fff",
        tabBarActiveTintColor: "#1e3a5f",
        tabBarInactiveTintColor: "#999",
      }}
    >
      <Tabs.Screen
        name="area-personale"
        options={{
          title: "Area personale",
          headerTitle: APP_NAME,
        }}
      />
      <Tabs.Screen
        name="prenotazioni"
        options={{
          title: "Prenotazioni",
          headerTitle: APP_NAME,
          headerRight: () => (
            <Link href="/mie-prenotazioni" asChild>
              <Pressable style={{ marginRight: 16 }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>
                  Le mie
                </Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="lezioni"
        options={{
          title: "Lezioni",
          headerTitle: APP_NAME,
          href: isDocente ? "/(tabs)/lezioni" : null,
        }}
      />
    </Tabs>
  );
}
