import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createClient>>;

/** Allievo o tutore (`tutor_links` oppure email famiglia). */
export async function canActorPayLessonFeesForMember(
  client: UserClient,
  actorMemberId: string,
  studentMemberId: string,
): Promise<boolean> {
  if (actorMemberId === studentMemberId) return true;

  // tutor_links non è ancora nei tipi generati.
  const untyped = client as unknown as SupabaseClient;
  const { data: link } = await untyped
    .from("tutor_links")
    .select("ward_member_id")
    .eq("tutor_member_id", actorMemberId)
    .eq("ward_member_id", studentMemberId)
    .maybeSingle();
  if (link) return true;

  const { data: student, error: studentError } = await client
    .from("members")
    .select("manual_tutor_email")
    .eq("id", studentMemberId)
    .maybeSingle();
  if (studentError || !student?.manual_tutor_email?.trim()) {
    return false;
  }

  const { data: actor, error: actorError } = await client
    .from("members")
    .select("email")
    .eq("id", actorMemberId)
    .maybeSingle();
  if (actorError || !actor?.email?.trim()) {
    return false;
  }

  return (
    actor.email.trim().toLowerCase() ===
    student.manual_tutor_email.trim().toLowerCase()
  );
}