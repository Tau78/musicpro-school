import { redirect } from "next/navigation";

import { getAdminMember } from "@/lib/admin/current-member";
import { canAccessAdmin } from "@/lib/admin/roles";

export default async function AdminIndexPage() {
  const member = await getAdminMember();

  if (!member) {
    redirect("/login");
  }

  if (canAccessAdmin(member.roles)) {
    redirect("/dashboard");
  }

  redirect("/dashboard?error=unauthorized");
}
