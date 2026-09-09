import { NextRequest, NextResponse } from "next/server";

import {
  handleGetOp,
  handlePostAction,
} from "@/lib/iscrizione/enrollment-service";
import { isIscrizioneInternalAuthorized } from "@/lib/iscrizione/internal-auth";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-iscrizione-internal-secret",
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const op = request.nextUrl.searchParams.get("op") || "";
    const idIscrizione =
      request.nextUrl.searchParams.get("idIscrizione") ||
      request.nextUrl.searchParams.get("id") ||
      "";
    const token = request.nextUrl.searchParams.get("token") || "";

    const result = await handleGetOp(op, { idIscrizione, token });
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, message }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "inviaIscrizione").trim();
    // completaInvioIscrizione: solo Edge/cron interno (secret), non pubblica.
    // Il browser usa GET sincronizzaPagamento / getStatoIscrizione.
    if (
      action === "completaInvioIscrizione" &&
      !isIscrizioneInternalAuthorized(request)
    ) {
      return jsonResponse({ success: false, message: "Non autorizzato" }, 401);
    }
    const result = await handlePostAction(body);
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    const isClient =
      lower.includes("obbligator") ||
      lower.includes("non valid") ||
      lower.includes("link non") ||
      lower.includes("scadut") ||
      lower.includes("già utilizz") ||
      lower.includes("firma") ||
      lower.includes("plausibile") ||
      lower.includes("futuro") ||
      lower.includes("minorenn");
    return jsonResponse({ success: false, message }, isClient ? 400 : 500);
  }
}
