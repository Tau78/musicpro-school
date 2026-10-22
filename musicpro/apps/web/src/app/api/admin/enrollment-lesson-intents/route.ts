import { NextRequest, NextResponse } from "next/server";

import {
  generateCourseLessons,
  getCurrentMemberWithRoles,
  listIntentsForStaff,
  reconcileEnrollmentLessonIntent,
} from "@musicpro/database";

import { isFrontDesk } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

async function requireStaff() {
  const supabase = await createClient();
  const current = await getCurrentMemberWithRoles(supabase);
  if (!current || !isFrontDesk(current.roles)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: "Non autorizzato." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, actorId: current.id };
}

export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  try {
    const db = createServiceRoleClient();
    const intents = await listIntentsForStaff(db);
    return NextResponse.json({ success: true, intents });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

interface ReconcileBody {
  action?: string;
  intentId?: string;
}

export async function POST(request: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  let body: ReconcileBody;
  try {
    body = (await request.json()) as ReconcileBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Richiesta non valida." },
      { status: 400 },
    );
  }

  const action = String(body.action || "reconcile").trim();
  if (action !== "reconcile") {
    return NextResponse.json(
      { success: false, message: `Azione non supportata: ${action}` },
      { status: 400 },
    );
  }

  const intentId = String(body.intentId || "").trim();
  if (!intentId) {
    return NextResponse.json(
      { success: false, message: "Intent mancante." },
      { status: 400 },
    );
  }

  try {
    const db = createServiceRoleClient();
    const result = await reconcileEnrollmentLessonIntent(
      db,
      intentId,
      gate.actorId,
    );
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.errorMessage || "Operazione fallita." },
        { status: 400 },
      );
    }

    const courseId = result.id?.trim() || "";
    const lessonWarnings: string[] = [];
    if (courseId) {
      const generated = await generateCourseLessons(db, courseId);
      if (!generated.success) {
        lessonWarnings.push(
          generated.errorMessage ||
            "Corso creato ma le lezioni non sono state generate.",
        );
      } else if (generated.warnings?.length) {
        lessonWarnings.push(...generated.warnings);
      }
    }

    return NextResponse.json({
      success: true,
      courseId: courseId || null,
      lessonWarnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
