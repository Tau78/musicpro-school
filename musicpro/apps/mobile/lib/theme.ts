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
    return { color: "#38764B", emoji: "🍃" };
  }
  if (lower.includes("rossa")) {
    return { color: "#B23B3E", emoji: "🎸" };
  }
  if (lower.includes("arancio")) {
    return { color: "#D2762A", emoji: "🔥" };
  }
  return { color: "#1e3a5f", emoji: "🎵" };
}

export function roomCapacityLabel(
  name: string,
  capacity?: number | null,
): string {
  if (capacity != null && capacity > 0) {
    return `2/${capacity} persone`;
  }
  const lower = name.toLowerCase();
  if (lower.includes("verde")) return "2/5 persone";
  if (lower.includes("rossa")) return "2/6 persone";
  if (lower.includes("arancio")) return "2/8 persone";
  return "";
}
