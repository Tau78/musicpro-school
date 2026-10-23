import { redirect } from "next/navigation";

import { getAdminMember } from "@/lib/admin/current-member";
import { getDocumentiSegreteriaFlags } from "@/lib/admin/documenti-permissions";
import {
  buildDocumentiNavFlags,
  firstDocumentiHref,
} from "@/lib/admin/documenti-nav";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member) {
    redirect("/login?error=member_not_linked&redirect=/admin/documenti");
  }

  const flags = await getDocumentiSegreteriaFlags();

  redirect(firstDocumentiHref(buildDocumentiNavFlags(member.roles, flags)));
}
