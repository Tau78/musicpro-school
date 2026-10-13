import { NextResponse } from "next/server";

import { marketCorsHeaders } from "@/lib/market/cors";
import { reserveMarketListing } from "@/lib/market/reserve";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: marketCorsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = marketCorsHeaders(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Richiesta non valida." },
      { status: 400, headers },
    );
  }

  const result = await reserveMarketListing(
    body && typeof body === "object" ? (body as Record<string, string>) : {},
  );
  return NextResponse.json(result, {
    status: result.success ? 200 : 400,
    headers,
  });
}
