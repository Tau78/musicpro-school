import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { type Database } from "@musicpro/database";

import { getAdminMember } from "@/lib/admin/current-member";
import { canManageShop } from "@/lib/admin/roles";
import { issueAndEmailCreditShopPurchase } from "@/lib/lezioni/issue-receipt-copy";
import { createClient } from "@/lib/supabase/server";

function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function POST(request: Request) {
  let purchaseId = "";
  let codTrans = "";
  try {
    const body = (await request.json()) as {
      purchaseId?: string;
      codTrans?: string;
    };
    purchaseId = String(body.purchaseId || "").trim();
    codTrans = String(body.codTrans || "").trim();
  } catch {
    return NextResponse.json(
      { success: false, message: "Body non valido" },
      { status: 400 },
    );
  }

  const cron = isCronAuthorized(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let client;
  let actorMemberId: string | null = null;

  if (cron) {
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { success: false, message: "Config Supabase mancante" },
        { status: 500 },
      );
    }
    client = createServiceClient<Database>(supabaseUrl, serviceKey);
  } else {
    const member = await getAdminMember();
    if (!member || !canManageShop(member.roles)) {
      return NextResponse.json(
        { success: false, message: "Non autorizzato" },
        { status: 401 },
      );
    }
    actorMemberId = member.id;
    client = await createClient();
  }

  if (!purchaseId && !codTrans) {
    return NextResponse.json(
      { success: false, message: "Manca purchaseId o codTrans" },
      { status: 400 },
    );
  }

  if (!purchaseId) {
    const { data, error } = await client
      .from("credit_purchases")
      .select("id")
      .eq("stripe_payment_intent_id", codTrans)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error.message || "Impossibile cercare l'acquisto.",
        },
        { status: 500 },
      );
    }
    const found = data?.[0]?.id;
    if (!found) {
      return NextResponse.json(
        { success: false, message: "Acquisto non trovato." },
        { status: 500 },
      );
    }
    purchaseId = found;
  }

  const result = await issueAndEmailCreditShopPurchase(
    client,
    purchaseId,
    actorMemberId,
  );
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage ?? "Ricevuta non inviata",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    receiptId: result.id ?? null,
    warnings: result.warnings ?? [],
  });
}
