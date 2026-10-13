const ALLOWED_ORIGINS = new Set([
  "https://www.musicproeventi.it",
  "https://musicproeventi.it",
]);

export function marketCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://www.musicproeventi.it";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
