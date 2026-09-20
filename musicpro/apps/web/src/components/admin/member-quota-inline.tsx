"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  type AnnualQuotaSetting,
  type MemberAnnualQuota,
  buildMemberQuotaHistory,
  buildQuotaDunningMessage,
  clearMemberAnnualQuota,
  formatQuotaDateItalian,
  formatQuotaEuro,
  listMemberAnnualQuotas,
  recordMemberQuotaDunning,
  upsertMemberAnnualQuotas,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}

function draftsFromQuotas(
  quotas: MemberAnnualQuota[],
): Record<number, string> {
  const next: Record<number, string> = {};
  for (const quota of quotas) {
    next[quota.fiscalYear] = toDateInputValue(quota.paidAt);
  }
  return next;
}

interface MemberQuotaInlineProps {
  memberId: string;
  memberFirstName: string;
  memberEmail: string | null;
  quotas: MemberAnnualQuota[];
  quotaSettings: AnnualQuotaSetting[];
  enrolledAt: string | null;
}

export function MemberQuotaInline({
  memberId,
  memberFirstName,
  memberEmail,
  quotas: initialQuotas,
  quotaSettings,
  enrolledAt,
}: MemberQuotaInlineProps) {
  const router = useRouter();
  const supabase = createClient();

  const [quotas, setQuotas] = useState(initialQuotas);
  const [draftDates, setDraftDates] = useState(() =>
    draftsFromQuotas(initialQuotas),
  );
  const [paymentLinks, setPaymentLinks] = useState<Record<number, string>>({});
  const [busyYear, setBusyYear] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<
    "save" | "clear" | "dunning" | "link" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setQuotas(initialQuotas);
    setDraftDates(draftsFromQuotas(initialQuotas));
  }, [initialQuotas]);

  const amountByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const setting of quotaSettings) {
      map.set(setting.fiscalYear, setting.amountEur);
    }
    return map;
  }, [quotaSettings]);

  const history = useMemo(
    () =>
      buildMemberQuotaHistory({
        quotas,
        enrolledAt,
        settings: quotaSettings,
      }),
    [quotas, enrolledAt, quotaSettings],
  );

  async function refreshQuotas() {
    const refreshed = await listMemberAnnualQuotas(supabase, { memberId });
    setQuotas(refreshed);
    setDraftDates(draftsFromQuotas(refreshed));
    router.refresh();
  }

  async function createPaymentLink(
    fiscalYear: number,
    opts?: { silent?: boolean },
  ): Promise<string | null> {
    const resp = await fetch("/api/admin/quota-payment-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ memberId, fiscalYear }),
    });
    const raw = await resp.text();
    let data: { success?: boolean; url?: string; message?: string } = {};
    try {
      data = raw ? (JSON.parse(raw) as typeof data) : {};
    } catch {
      /* ignore */
    }
    if (!resp.ok || !data.success || !data.url) {
      if (!opts?.silent) {
        setError(data.message ?? "Impossibile creare il link di pagamento.");
      }
      return null;
    }
    setPaymentLinks((prev) => ({ ...prev, [fiscalYear]: data.url! }));
    return data.url;
  }

  async function saveYear(fiscalYear: number) {
    const paidAt = (draftDates[fiscalYear] ?? "").trim() || todayInputValue();
    const existing = quotas.find((q) => q.fiscalYear === fiscalYear);
    const amount =
      existing?.amountPaidEur ??
      existing?.amountDueEur ??
      amountByYear.get(fiscalYear) ??
      null;

    if (amount == null) {
      setError(
        `Manca l'importo per il ${fiscalYear}. Impostalo in Quote → Importi.`,
      );
      setSuccess(null);
      return;
    }

    setBusyYear(fiscalYear);
    setBusyAction("save");
    setError(null);
    setSuccess(null);

    const result = await upsertMemberAnnualQuotas(supabase, [
      {
        memberId,
        fiscalYear,
        paidAt,
        amountPaidEur: amount,
        amountDueEur: amount,
      },
    ]);

    if (!result.success) {
      setBusyYear(null);
      setBusyAction(null);
      setError(result.errorMessage ?? "Impossibile salvare la quota.");
      return;
    }

    try {
      await refreshQuotas();
      setSuccess(`Quota ${fiscalYear} registrata.`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Salvata, ma ricarica la pagina per aggiornare l'elenco.",
      );
    } finally {
      setBusyYear(null);
      setBusyAction(null);
    }
  }

  async function clearYear(fiscalYear: number) {
    if (
      !window.confirm(
        `Segnare la quota ${fiscalYear} come non versata? Il versamento registrato verrà rimosso.`,
      )
    ) {
      return;
    }

    setBusyYear(fiscalYear);
    setBusyAction("clear");
    setError(null);
    setSuccess(null);

    const result = await clearMemberAnnualQuota(
      supabase,
      memberId,
      fiscalYear,
    );

    if (!result.success) {
      setBusyYear(null);
      setBusyAction(null);
      setError(result.errorMessage ?? "Impossibile annullare il versamento.");
      return;
    }

    try {
      await refreshQuotas();
      setSuccess(`Quota ${fiscalYear} segnata come non versata.`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Annullata, ma ricarica la pagina per aggiornare l'elenco.",
      );
    } finally {
      setBusyYear(null);
      setBusyAction(null);
    }
  }

  async function linkYear(fiscalYear: number) {
    setBusyYear(fiscalYear);
    setBusyAction("link");
    setError(null);
    setSuccess(null);
    try {
      const url = await createPaymentLink(fiscalYear);
      if (url) {
        setSuccess(`Link pagamento ${fiscalYear} creato. Copia o includilo nel sollecito.`);
        try {
          await navigator.clipboard.writeText(url);
          setSuccess(`Link pagamento ${fiscalYear} creato e copiato negli appunti.`);
        } catch {
          /* clipboard optional */
        }
      }
    } finally {
      setBusyYear(null);
      setBusyAction(null);
    }
  }

  async function sollecitoYear(
    fiscalYear: number,
    amountEur: number | null,
  ) {
    if (!memberEmail?.trim()) {
      setError("Manca l'email dell'associato: impossibile inviare il sollecito.");
      setSuccess(null);
      return;
    }

    setBusyYear(fiscalYear);
    setBusyAction("dunning");
    setError(null);
    setSuccess(null);

    try {
      let paymentUrl: string | null = paymentLinks[fiscalYear] ?? null;
      if (!paymentUrl) {
        paymentUrl = await createPaymentLink(fiscalYear, { silent: true });
      }

      const message = buildQuotaDunningMessage({
        firstName: memberFirstName,
        fiscalYear,
        amountEur,
        paymentUrl,
      });

      const resp = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          memberIds: [memberId],
          channel: "email",
          subject: message.subject,
          body: message.body,
        }),
      });
      const raw = await resp.text();
      let data: {
        success?: boolean;
        message?: string;
        sent?: number;
        skipped?: number;
        warnings?: string[];
      } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        /* ignore */
      }

      if (!resp.ok || !data.success) {
        setError(
          data.message ||
            data.warnings?.[0] ||
            "Impossibile inviare il sollecito.",
        );
        return;
      }

      const sent = data.sent ?? 0;
      if (sent < 1) {
        setError(
          data.warnings?.[0] ||
            "Nessuna email inviata (destinatario assente o canale non disponibile).",
        );
        return;
      }

      await recordMemberQuotaDunning(supabase, {
        memberId,
        fiscalYear,
        amountDueEur: amountEur,
      });
      await refreshQuotas();
      setSuccess(
        paymentUrl
          ? `Sollecito ${fiscalYear} inviato con link di pagamento.`
          : `Sollecito ${fiscalYear} inviato.`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Impossibile inviare il sollecito.",
      );
    } finally {
      setBusyYear(null);
      setBusyAction(null);
    }
  }

  function mailtoHref(
    fiscalYear: number,
    amountEur: number | null,
  ): string {
    const message = buildQuotaDunningMessage({
      firstName: memberFirstName,
      fiscalYear,
      amountEur,
      paymentUrl: paymentLinks[fiscalYear] ?? null,
    });
    const to = memberEmail?.trim() ?? "";
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
  }

  return (
    <div className="space-y-2 border-t border-neutral-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-800">Quote annuali</p>
        <Link
          href="/admin/quote?sezione=pagamenti"
          className="text-xs font-medium text-[var(--brand)] hover:underline"
        >
          Gestisci in Quote
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="text-sm text-green-700">{success}</p>
      ) : null}

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {history.map((row) => {
          const versata = row.status === "versata";
          const draft = draftDates[row.fiscalYear] ?? "";
          const busy = busyYear === row.fiscalYear;
          const link = paymentLinks[row.fiscalYear];
          return (
            <li key={row.fiscalYear} className="space-y-2 px-3 py-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-medium text-neutral-900">
                    {row.fiscalYear}
                  </span>
                  <span
                    className={versata ? "text-green-700" : "text-amber-700"}
                  >
                    {versata ? "versata" : "non versata"}
                  </span>
                  {row.amountEur != null ? (
                    <span className="text-neutral-500">
                      ({formatQuotaEuro(row.amountEur)})
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={draft}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDraftDates((prev) => ({
                        ...prev,
                        [row.fiscalYear]: value,
                      }));
                      setError(null);
                      setSuccess(null);
                    }}
                    disabled={busy}
                    aria-label={`Data versamento ${row.fiscalYear}`}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-800 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveYear(row.fiscalYear)}
                    className="shrink-0 rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                  >
                    {busy && busyAction === "save"
                      ? "…"
                      : versata
                        ? "Aggiorna"
                        : "Registra"}
                  </button>
                  {versata ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void clearYear(row.fiscalYear)}
                      className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                    >
                      {busy && busyAction === "clear" ? "…" : "Annulla"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void linkYear(row.fiscalYear)}
                        className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {busy && busyAction === "link" ? "…" : "Link paga"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !memberEmail?.trim()}
                        onClick={() =>
                          void sollecitoYear(row.fiscalYear, row.amountEur)
                        }
                        title={
                          memberEmail?.trim()
                            ? "Invia sollecito via email (con link se disponibile)"
                            : "Manca l'email dell'associato"
                        }
                        className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {busy && busyAction === "dunning" ? "…" : "Sollecita"}
                      </button>
                      {memberEmail?.trim() ? (
                        <a
                          href={mailtoHref(row.fiscalYear, row.amountEur)}
                          className="shrink-0 text-xs font-medium text-[var(--brand)] hover:underline"
                        >
                          Apri email
                        </a>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              {!versata && row.dunningCount > 0 ? (
                <p className="text-xs text-neutral-500">
                  Ultimo sollecito
                  {row.lastDunningAt
                    ? ` il ${formatQuotaDateItalian(row.lastDunningAt)}`
                    : ""}
                  {" · "}
                  {row.dunningCount} inviat{row.dunningCount === 1 ? "o" : "i"}
                </p>
              ) : null}
              {link ? (
                <p className="truncate text-xs text-neutral-500">
                  Link:{" "}
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[var(--brand)] hover:underline"
                  >
                    {link}
                  </a>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        «Link paga» genera un checkout Stripe. Sollecita lo include nell&apos;email
        e aggiorna lo storico solleciti.
      </p>
    </div>
  );
}
