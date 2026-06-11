import { Tabs } from "expo-router";

import { APP_NAME } from "@musicpro/shared";

export default function TabsLayout() {
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
        }}
      />
    </Tabs>
  );
}
