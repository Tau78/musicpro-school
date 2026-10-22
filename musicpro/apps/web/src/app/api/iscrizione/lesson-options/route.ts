import { NextResponse } from "next/server";

import { listEnrollmentLessonOptions } from "@/lib/iscrizione/lesson-options";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const payload = await listEnrollmentLessonOptions();
    return NextResponse.json(payload, { headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { courses: [], message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
