import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  listAppSettings,
  upsertAppSetting,
} from "@musicpro/database";

import { canAccessDocumentiSubsection, getDocumentiSegreteriaFlags } from "@/lib/admin/documenti-permissions";
import {
  parseScadenziarioState,
  sanitizeScadenziarioState,
  VERBALI_SCADENZIARIO_SETTING_KEY,
  type VerbaliScadenziarioState,
} from "@/lib/admin/verbali-scadenziario";
import { createClient } from "@/lib/supabase/server";

interface PutBody {
  state?: unknown;
}

async function requireVerbaliAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      error: NextResponse.json(
        { success: false, message: "Non autenticato" },
        { status: 401 },
      ),
    };
  }

  const member = await getCurrentMemberWithRoles(supabase);
  const flags = await getDocumentiSegreteriaFlags(supabase);
  if (
    !member ||
    !canAccessDocumentiSubsection(member.roles, "verbali", flags)
  ) {
    return {
      supabase,
      error: NextResponse.json(
        { success: false, message: "Non autorizzato" },
        { status: 403 },
      ),
    };
  }

  return { supabase, error: null };
}

export async function GET() {
  const access = await requireVerbaliAccess();
  if (access.error) {
    return access.error;
  }

  const settings = await listAppSettings(access.supabase, [
    VERBALI_SCADENZIARIO_SETTING_KEY,
  ]);
  const raw = settings.find(
    (setting) => setting.key === VERBALI_SCADENZIARIO_SETTING_KEY,
  )?.value;

  const state = parseScadenziarioState(raw);

  return NextResponse.json({ success: true, state });
}

export async function PUT(request: Request) {
  const access = await requireVerbaliAccess();
  if (access.error) {
    return access.error;
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const state: VerbaliScadenziarioState = sanitizeScadenziarioState(body.state);
  const result = await upsertAppSetting(
    access.supabase,
    VERBALI_SCADENZIARIO_SETTING_KEY,
    JSON.stringify(state),
    "Stato checklist scadenziario verbali (RUNTS/ETS)",
  );

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage ?? "Impossibile salvare lo scadenziario.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, state });
}
