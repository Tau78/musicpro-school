import { NextResponse } from "next/server";

/** PIN tabellone rimosso: redirect diretto alla lista. */
export async function POST(request: Request) {
  let nextPath = "/tabellone";
  try {
    const body = (await request.json()) as { next?: unknown };
    if (typeof body?.next === "string" && body.next.startsWith("/tabellone")) {
      nextPath = body.next;
    }
  } catch {
    // ignore
  }
  return NextResponse.redirect(new URL(nextPath, request.url), 303);
}
