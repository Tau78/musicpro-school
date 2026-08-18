import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getAppBookingSettings,
  listCancellationPenaltyRules,
} from "@musicpro/database";

import { BookingSettingsForm } from "@/components/admin/booking-settings-form";
import { PenaltyRulesPanel } from "@/components/admin/penalty-rules-panel";
import { PrenotazioniSettingsNav } from "@/components/admin/prenotazioni-settings-nav";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManagePenalties, canManageSettings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

type PrenotazioniSettingsSection = "soglie" | "penali" | "crediti";

function parseSection(value: string | undefined): PrenotazioniSettingsSection {
  if (value === "penali" || value === "crediti" || value === "rimborsi") {
    return value === "rimborsi" ? "crediti" : value;
  }
  return "soglie";
}

export default async function ImpostazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ sezione?: string }>;
}) {
  const supabase = await createClient();
  const member = await getAdminMember();
  const { sezione } = await searchParams;
  const section = parseSection(sezione);

  if (
    !member ||
    (!canManageSettings(member.roles) && !canManagePenalties(member.roles))
  ) {
    redirect("/admin/rimborsi");
  }

  const [settings, rules] = await Promise.all([
    getAppBookingSettings(supabase),
    listCancellationPenaltyRules(supabase).catch(() => []),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Prenotazioni
        </h2>
      </div>

      <PrenotazioniSettingsNav section={section} />

      {section === "soglie" ? (
        <BookingSettingsForm settings={settings} />
      ) : null}

      {section === "penali" ? <PenaltyRulesPanel rules={rules} /> : null}

      {section === "crediti" ? (
        <CreditiPrenotazioniSection rules={rules} />
      ) : null}
    </div>
  );
}

function CreditiPrenotazioniSection({
  rules,
}: {
  rules: Awaited<ReturnType<typeof listCancellationPenaltyRules>>;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600">
        I crediti restituiti sono il complemento della penale.{" "}
        <Link
          href="/admin/impostazioni?sezione=penali"
          className="text-[var(--brand)] hover:underline"
        >
          Penali
        </Link>
      </p>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Ore prima
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Penale
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Crediti
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Stato
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rules.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-neutral-500"
                >
                  Nessuna fascia. Aggiungi regole in Penali.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-900">
                    Da {rule.fromHours}h a {rule.toHours}h
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    {rule.penaltyPercent}%
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {Math.max(0, 100 - rule.penaltyPercent)}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        rule.enabled ? "text-green-700" : "text-neutral-400"
                      }
                    >
                      {rule.enabled ? "Attiva" : "Disattivata"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-neutral-500">
        Notule docenti:{" "}
        <Link
          href="/admin/rimborsi"
          className="text-[var(--brand)] hover:underline"
        >
          Rimborsi
        </Link>
        .
      </p>
    </div>
  );
}
