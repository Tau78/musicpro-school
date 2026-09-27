import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { theme } from "@/lib/theme";

export function AssociateGradientBg({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={styles.topGlow} pointerEvents="none" />
      <View style={styles.bottomGlow} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.gradientBottom,
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: theme.gradientTop,
  },
  bottomGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "35%",
    backgroundColor: theme.gradientBottom,
    opacity: 0.6,
  },
});
