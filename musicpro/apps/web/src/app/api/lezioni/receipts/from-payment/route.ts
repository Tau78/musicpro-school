import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { type Database } from "@musicpro/database";

import { issueAndEmailReceiptCopy } from "@/lib/lezioni/issue-receipt-copy";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { success: false, message: "Config Supabase mancante" },
      { status: 500 },
    );
  }

  let paymentId = "";
  try {
    const body = (await request.json()) as { paymentId?: string };
    paymentId = String(body.paymentId || "").trim();
  } catch {
    return NextResponse.json(
      { success: false, message: "Body non valido" },
      { status: 400 },
    );
  }
  if (!paymentId) {
    return NextResponse.json(
      { success: false, message: "Manca paymentId" },
      { status: 400 },
    );
  }

  const service = createClient<Database>(supabaseUrl, serviceKey);
  const result = await issueAndEmailReceiptCopy(service, paymentId);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: result.errorMessage ?? "Ricevuta non emessa" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    receiptId: result.id ?? null,
    warnings: result.warnings ?? [],
  });
}
