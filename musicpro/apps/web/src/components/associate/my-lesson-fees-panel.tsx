"use client";

import { useMemo, useState } from "react";

import {
  formatEuro,
  todayInRome,
  type LessonFeeRow,
} from "@musicpro/database";

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

function feeTitle(fee: LessonFeeRow): string {
  if (fee.kind === "quota") return "Quota associativa";
  return fee.courseName || "Pacchetto lezioni";
}

function LessonFeePayButton({
  fee,
  label = "Paga",
}: {
  fee: LessonFeeRow;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      if (fee.kind === "quota") {
        const response = await fetch("/api/onboarding/quota", { method: "POST" });
        const data = (await response.json()) as {
          success?: boolean;
          url?: string;
          message?: string;
        };
        if (!response.ok || !data.success || !data.url) {
          throw new Error(data.message ?? "Impossibile avviare il pagamento.");
        }
        window.location.href = data.url;
        return;
      }

      const enrollmentId = fee.courseEnrollmentId?.trim();
      if (!enrollmentId) {
        throw new Error("Iscrizione al corso non disponibile per questa retta.");
      }

      const response = await fetch("/api/lezioni/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        url?: string;
        message?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.message ?? "Impossibile avviare il pagamento.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile avviare il pagamento.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error ? (
        <p className="max-w-[14rem] text-right text-xs text-red-700">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={() => void handlePay()}
        className="btn-brand shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        {loading ? "…" : label}
      </button>
    </div>
  );
}

export function MyLessonFeesPanel({
  fees,
  paymentComplete = false,
}: {
  fees: LessonFeeRow[];
  paymentComplete?: boolean;
}) {
  const today = todayInRome();
  const showStudent = useMemo(() => {
    const ids = new Set(fees.map((f) => f.memberId));
    return ids.size > 1;
  }, [fees]);

  return (
    <div className="space-y-4">
      {paymentComplete ? (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          Pagamento ricevuto. I crediti si aggiornano entro un minuto.
        </div>
      ) : null}

      {fees.length === 0 ? (
        <div className="glass-card px-5 py-8 text-center">
          <p className="font-medium text-[var(--brand)]">Nessuna retta da saldare</p>
          <p className="mt-1 text-sm text-neutral-600">
            Quando c&apos;è qualcosa da pagare, lo trovi qui.
          </p>
        </div>
      ) : (
        <ul className="glass-card divide-y divide-neutral-200/80 overflow-hidden p-0">
          {fees.map((fee) => {
            const overdue = fee.dueOn < today;
            return (
              <li
                key={fee.id}
                className="flex items-center gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--brand)]">
                    {feeTitle(fee)}
                    {showStudent && fee.studentLabel ? (
                      <span className="font-normal text-neutral-600">
                        {" "}
                        · {fee.studentLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    Scadenza{" "}
                    <span className={overdue ? "font-medium text-red-700" : ""}>
                      {formatShortDate(fee.dueOn)}
                      {overdue ? " · scaduta" : ""}
                    </span>
                    {fee.status === "parziale" ? (
                      <span className="text-neutral-500"> · saldo residuo</span>
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">
                  {formatEuro(fee.remainingEur)}
                </p>
                <LessonFeePayButton fee={fee} label="Paga" />
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-xs text-neutral-500">
        Paga retta lezioni in sicurezza online. Per dubbi, contatta la segreteria.
      </p>
    </div>
  );
}
