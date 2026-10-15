import { NextResponse } from "next/server";

import { ensureAssociatoAuthForEmail } from "@/lib/auth/member-login-access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface Body {
  email?: string;
}

/** Idempotente: prepara Auth per email in rubrica (magic link / recovery). Risposta sempre generica. */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: true });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ success: true });
  }

  try {
    const service = createServiceRoleClient();
    await ensureAssociatoAuthForEmail(service, email);
  } catch (err) {
    console.warn("[prepare-login]", err);
  }

  return NextResponse.json({ success: true });
}
