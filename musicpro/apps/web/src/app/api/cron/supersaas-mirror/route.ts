import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { redactSecrets } from "@/lib/supersaas/supersaas-bookings.mjs";
import {
  isSuperSaasImportEnabled,
  syncSuperSaasMirror,
} from "@/lib/supersaas/supersaas-mirror-sync.mjs";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 401 },
    );
  }

  const apiKey = process.env.SUPERSAAS_API_KEY?.trim() ?? "";
  const account = process.env.SUPERSAAS_ACCOUNT?.trim() || "MusicPro";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { success: false, message: "Config Supabase mancante" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (!(await isSuperSaasImportEnabled(supabase))) {
      return NextResponse.json({
        success: true,
        disabled: true,
        mirrored: 0,
        message:
          "Import SuperSaaS disabilitato (cutover). Specchio non aggiornato.",
      });
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "SUPERSAAS_API_KEY mancante" },
        { status: 500 },
      );
    }

    const result = await syncSuperSaasMirror(supabase, { apiKey, account });
    return NextResponse.json({
      success: true,
      mirrored: result.mirrored,
      syncedAt: result.syncedAt,
      scheduleId: result.scheduleId,
    });
  } catch (error) {
    const message = redactSecrets(
      error instanceof Error ? error.message : "Sync SuperSaaS fallito",
      [apiKey],
    );
    return NextResponse.json(
      { success: false, message: message.slice(0, 500) },
      { status: 500 },
    );
  }
}
