import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LESSON_KIND_COLORS } from "@/lib/lezioni-colors";

const NAVY = "#1e3a5f";

const ENTRIES: { key: keyof typeof LESSON_KIND_COLORS; label: string }[] = [
  { key: "prova", label: "Prova" },
  { key: "individuale", label: "Individuale" },
  { key: "gruppo", label: "Gruppo" },
  { key: "online", label: "Online" },
];

export function LessonKindLegend() {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
      >
        <Text style={styles.toggle}>
          Legenda colori {open ? "▾" : "▸"}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {ENTRIES.map(({ key, label }) => {
            const c = LESSON_KIND_COLORS[key];
            return (
              <View key={key} style={styles.row}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: c.bg, borderColor: c.border },
                  ]}
                />
                <Text style={styles.label}>{label}</Text>
              </View>
            );
          })}
          <View style={styles.row}>
            <View style={[styles.swatch, styles.swatchDashed]} />
            <Text style={styles.label}>In attesa</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 4,
  },
  toggle: {
    fontSize: 13,
    fontWeight: "500",
    color: NAVY,
  },
  body: {
    marginTop: 8,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  swatchDashed: {
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
    borderStyle: "dashed",
  },
  label: {
    fontSize: 13,
    color: "#444",
  },
});
