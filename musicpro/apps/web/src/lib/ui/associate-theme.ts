export function roomVisualFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("verde")) {
    return { key: "verde" as const, color: "#38764B", tag: "Rock / Acoustic" };
  }
  if (lower.includes("rossa")) {
    return { key: "rossa" as const, color: "#B23B3E", tag: "Elettrica" };
  }
  if (lower.includes("arancio")) {
    return { key: "arancio" as const, color: "#D2762A", tag: "Creativa / Mix" };
  }
  return { key: "default" as const, color: "#1e3a5f", tag: "" };
}

export function formatLessonWhen(startsAt: string): string {
  const date = new Date(startsAt);
  const weekday = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    timeZone: "Europe/Rome",
  }).format(date);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(date);
  return `${weekday} ${time}`;
}

export function memberInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}
