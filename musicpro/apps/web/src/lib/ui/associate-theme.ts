export function roomVisualFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("verde")) {
    return { key: "verde" as const, color: "#38764B" };
  }
  if (lower.includes("rossa")) {
    return { key: "rossa" as const, color: "#B23B3E" };
  }
  if (lower.includes("arancio")) {
    return { key: "arancio" as const, color: "#D2762A" };
  }
  return { key: "default" as const, color: "#1e3a5f" };
}

/** Capacità sala per associati (es. «2/5 persone»). */
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

/** Etichetta completa per la prossima prenotazione sala (data + fascia oraria). */
export function formatBookingWhen(startAt: string, endAt?: string | null): string {
  const start = new Date(startAt);
  const day = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Rome",
  }).format(start);
  const startTime = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(start);
  if (!endAt) return `${day} · ${startTime}`;
  const endTime = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(new Date(endAt));
  return `${day} · ${startTime}–${endTime}`;
}

export function memberInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}
