import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  addMonths,
  generateDueLessonPayrollDrafts,
  getLessonSchoolSettings,
  listLessonPayrolls,
  notifyLessonPayrollDraft,
  sendDuePayrollSignReminders,
  todayInRome,
  yearMonthFromRomeDate,
  type Database,
} from "@musicpro/database";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, generated: 0, reminded: 0, errors: ["Non autorizzato"] },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      {
        success: false,
        generated: 0,
        reminded: 0,
        errors: ["Config Supabase mancante"],
      },
      { status: 500 },
    );
  }

  const service = createClient<Database>(supabaseUrl, serviceKey);
  const errors: string[] = [];
  let generated = 0;

  try {
    const settings = await getLessonSchoolSettings(service);
    const jobDay = settings?.notulaJobDay ?? 8;
    const today = todayInRome();
    const day = Number(today.slice(8, 10));

    // Il cron Vercel è già una volta al giorno (UTC). Non richiedere
    // anche l'ora Rome: 08:00 UTC ≠ 08:00 Europe/Rome (CET/CEST).
    if (day === jobDay) {
      const due = await generateDueLessonPayrollDrafts(service);
      generated = due.generated;
      errors.push(...due.errors);

      const current = yearMonthFromRomeDate(today);
      const prev = addMonths(current.year, current.month, -1);
      const drafts = await listLessonPayrolls(service, {
        year: prev.year,
        month: prev.month,
        status: "draft",
      });
      for (const payroll of drafts) {
        try {
          const notified = await notifyLessonPayrollDraft(service, payroll.id);
          if (!notified.ok && notified.error) {
            errors.push(notified.error);
          }
        } catch (err) {
          errors.push(
            err instanceof Error
              ? err.message
              : "Invio email notula fallito.",
          );
        }
      }
    }

    const reminders = await sendDuePayrollSignReminders(service);
    errors.push(...reminders.errors);

    return NextResponse.json({
      success: errors.length === 0,
      generated,
      reminded: reminders.reminded,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        generated,
        reminded: 0,
        errors: [
          ...errors,
          err instanceof Error ? err.message : "Job notule fallito.",
        ],
      },
      { status: 500 },
    );
  }
}
