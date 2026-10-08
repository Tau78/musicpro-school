import { redirect } from "next/navigation";

import { AdminLezioniSubNav } from "@/components/lezioni/admin-lezioni-sub-nav";
import { LessonsSandboxBanner } from "@/components/lezioni/lessons-sandbox-banner";
import { isLessonsModuleEnabled } from "@/lib/lessons-module";

export default function AdminLezioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isLessonsModuleEnabled()) {
    redirect("/dashboard?info=lessons_sandbox");
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <LessonsSandboxBanner />
      <AdminLezioniSubNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
