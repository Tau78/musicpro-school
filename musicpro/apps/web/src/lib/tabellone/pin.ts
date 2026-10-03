import { timingSafeEqual } from "node:crypto";

export const BOARD_PIN_COOKIE = "mp_board_pin";

export function boardPinsMatch(input: string, expected: string): boolean {
  const left = Buffer.from(input.trim().toUpperCase());
  const right = Buffer.from(expected.trim().toUpperCase());
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function safeBoardPath(value: string): string {
  if (!value.startsWith("/tabellone")) return "/tabellone";
  if (value.startsWith("//") || value.includes("\\")) return "/tabellone";
  return value;
}
