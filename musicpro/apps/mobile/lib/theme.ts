export const theme = {
  brand: "#1e3a5f",
  accent: "#c9a227",
  gradientTop: "#faf8f5",
  gradientBottom: "#ebe4dc",
  glass: "rgba(255, 255, 255, 0.82)",
  glassBorder: "rgba(255, 255, 255, 0.95)",
} as const;

export function roomVisualFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("verde")) {
    return { color: "#38764B", tag: "Rock / Acoustic", emoji: "🍃" };
  }
  if (lower.includes("rossa")) {
    return { color: "#B23B3E", tag: "Elettrica", emoji: "🎸" };
  }
  if (lower.includes("arancio")) {
    return { color: "#D2762A", tag: "Creativa / Mix", emoji: "🔥" };
  }
  return { color: "#1e3a5f", tag: "", emoji: "🎵" };
}
