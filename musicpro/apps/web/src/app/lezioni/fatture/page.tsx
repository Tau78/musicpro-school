import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { createClient } from "@/lib/supabase/server";

export default async function LezioniFatturePage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Fatture e rimborsi
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Qui trovi quello che c’è già. L’inbox unica è ancora da definire.
        </p>
      </div>
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <li>
          <Link
            href="/lezioni/notule"
            className="block px-4 py-3 hover:bg-neutral-50"
          >
            <span className="block text-sm font-medium text-neutral-900">
              Notule didattiche
            </span>
            <span className="block text-xs text-neutral-600">
              Ore del mese, compenso, firma o fattura
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/dashboard/impostazioni"
            className="block px-4 py-3 hover:bg-neutral-50"
          >
            <span className="block text-sm font-medium text-neutral-900">
              Note spese
            </span>
            <span className="block text-xs text-neutral-600">
              Rimborsi in scheda associato, da portare in questa plancia
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
