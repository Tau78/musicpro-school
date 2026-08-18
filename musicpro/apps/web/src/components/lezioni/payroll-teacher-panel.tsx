"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addMonths,
  formatEuro,
  requestLessonPayrollDraft,
  signLessonPayroll,
  todayInRome,
  yearMonthFromRomeDate,
  type LessonPayroll,
  type LessonPayrollLine,
  type LessonPayrollLineKind,
  type LessonPayrollStatus,
  type PayrollPreview,
} from "@musicpro/database";

import {
  PayrollSignPad,
  type PayrollSignPadHandle,
} from "@/components/lezioni/payroll-sign-pad";
import {
  downloadLessonPayrollPdf,
  generateLessonPayrollPdf,
} from "@/lib/lezioni/payroll-pdf";
import { createClient } from "@/lib/supabase/client";

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const KIND_LABELS: Record<LessonPayrollLineKind, string> = {
  insegnamento: "Insegnamento",
  coordinamento: "Coordinamento",
  extra: "Extra",
  anticipo: "Anticipo",
  riporto: "Riporto",
};

const STATUS_LABELS: Record<LessonPayrollStatus, string> = {
  draft: "Bozza",
  signed: "Firmata",
  closed: "Chiusa",
};

const STATUS_BADGE: Record<LessonPayrollStatus, string> = {
  draft: "bg-amber-50 text-amber-800",
  signed: "bg-green-50 text-green-800",
  closed: "bg-neutral-100 text-neutral-700",
};

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(hours)} h`;
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

function formatDateTimeIt(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lettura file"));
    reader.readAsDataURL(file);
  });
}

function Totals({
  grossEur,
  advancesEur,
  netEur,
  carryInEur,
  carryOutEur,
  withholdingEur,
}: {
  grossEur: number;
  advancesEur: number;
  netEur: number;
  carryInEur?: number;
  carryOutEur?: number;
  withholdingEur?: number;
}) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-neutral-500">Lordo</dt>
        <dd className="font-medium text-neutral-900">{formatEuro(grossEur)}</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Anticipi</dt>
        <dd className="font-medium text-neutral-900">
          {formatEuro(advancesEur)}
        </dd>
      </div>
      <div>
        <dt className="text-neutral-500">Netto</dt>
        <dd className="font-semibold text-neutral-900">{formatEuro(netEur)}</dd>
      </div>
      {carryInEur ? (
        <div>
          <dt className="text-neutral-500">Riporto precedente</dt>
          <dd className="font-medium text-neutral-900">
            {formatEuro(carryInEur)}
          </dd>
        </div>
      ) : null}
      {carryOutEur ? (
        <div>
          <dt className="text-neutral-500">Riporto al mese dopo</dt>
          <dd className="font-medium text-neutral-900">
            {formatEuro(carryOutEur)}
          </dd>
        </div>
      ) : null}
      {withholdingEur ? (
        <div>
          <dt className="text-neutral-500">Ritenuta</dt>
          <dd className="font-medium text-neutral-900">
            {formatEuro(withholdingEur)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function LinesTable({ lines }: { lines: LessonPayrollLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-neutral-500">Nessuna riga in questo mese.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-neutral-500">
          <tr>
            <th className="pb-2 pr-3 font-medium">Data</th>
            <th className="pb-2 pr-3 font-medium">Voce</th>
            <th className="pb-2 pr-3 font-medium">Descrizione</th>
            <th className="pb-2 pr-3 font-medium">Ore</th>
            <th className="pb-2 text-right font-medium">Importo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {lines.map((line, index) => (
            <tr key={line.id ?? `${line.kind}-${line.sortOrder}-${index}`}>
              <td className="py-2 pr-3 text-neutral-700">
                {line.occurredOn ? formatShortDate(line.occurredOn) : "—"}
              </td>
              <td className="py-2 pr-3 text-neutral-700">
                {KIND_LABELS[line.kind] ?? line.kind}
              </td>
              <td className="py-2 pr-3 text-neutral-900">{line.description}</td>
              <td className="py-2 pr-3 text-neutral-700">
                {line.minutes > 0 ? formatHours(line.minutes) : "—"}
              </td>
              <td className="py-2 text-right font-medium text-neutral-900">
                {formatEuro(line.amountEur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PayrollTeacherPanel({
  teacherMemberId,
  preview,
  payrolls,
}: {
  teacherMemberId: string;
  preview: PayrollPreview;
  payrolls: LessonPayroll[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const signPadRefs = useRef<Record<string, PayrollSignPadHandle | null>>({});

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string | null>>(
    {},
  );
  const [invoices, setInvoices] = useState<
    Record<string, { base64: string; filename: string } | null>
  >({});

  const current = yearMonthFromRomeDate(todayInRome());
  const previous = addMonths(current.year, current.month, -1);
  const hasPrevious = payrolls.some(
    (row) => row.year === previous.year && row.month === previous.month,
  );

  async function handleRequestDraft() {
    setBusyKey("draft");
    setError(null);
    setNotice(null);
    const result = await requestLessonPayrollDraft(supabase, {
      teacherMemberId,
      year: previous.year,
      month: previous.month,
    });
    setBusyKey(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile generare la bozza.");
      return;
    }
    setNotice(`Bozza creata per ${monthLabel(previous.year, previous.month)}.`);
    router.refresh();
  }

  async function handleInvoiceChange(
    payrollId: string,
    file: File | undefined,
  ) {
    if (!file) {
      setInvoices((prev) => ({ ...prev, [payrollId]: null }));
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setInvoices((prev) => ({
        ...prev,
        [payrollId]: { base64, filename: file.name },
      }));
    } catch {
      setError("Impossibile leggere il file della fattura.");
    }
  }

  async function handleSign(payroll: LessonPayroll) {
    const fromPad = signPadRefs.current[payroll.id]?.capture() ?? null;
    const signaturePngBase64 = fromPad ?? signatures[payroll.id] ?? null;
    const invoice = invoices[payroll.id] ?? null;

    if (!signaturePngBase64 && !invoice) {
      setError("Firma sul canvas oppure carica la fattura.");
      setNotice(null);
      return;
    }

    setBusyKey(payroll.id);
    setError(null);
    setNotice(null);

    const result = await signLessonPayroll(supabase, {
      payrollId: payroll.id,
      actorMemberId: teacherMemberId,
      signaturePngBase64: signaturePngBase64 || undefined,
      invoiceBase64: invoice?.base64,
      invoiceFilename: invoice?.filename,
    });

    setBusyKey(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile firmare la notula.");
      return;
    }
    setNotice(
      invoice && !signaturePngBase64
        ? `Fattura inviata per ${monthLabel(payroll.year, payroll.month)}.`
        : `Notula firmata per ${monthLabel(payroll.year, payroll.month)}.`,
    );
    setSignatures((prev) => ({ ...prev, [payroll.id]: null }));
    setInvoices((prev) => ({ ...prev, [payroll.id]: null }));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Notule didattiche
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Compensi del mese dalle lezioni presenti. Firma in app o carica la
          fattura sulla bozza.
        </p>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-[var(--brand)]">
          Anteprima {monthLabel(preview.year, preview.month)}
        </h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Ore insegnamento</dt>
            <dd className="text-lg font-semibold text-neutral-900">
              {formatHours(preview.minutesTeaching)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Ore coordinamento</dt>
            <dd className="text-lg font-semibold text-neutral-900">
              {formatHours(preview.minutesCoordination)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">€ maturati</dt>
            <dd className="text-lg font-semibold text-neutral-900">
              {formatEuro(preview.grossEur)}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-neutral-600">
          Il mese è ancora in corso. Puoi chiedere la bozza dal 1° del mese
          successivo.
        </p>
      </section>

      {!hasPrevious ? (
        <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-[var(--brand)]">
            {monthLabel(previous.year, previous.month)}
          </h3>
          <p className="text-sm text-neutral-600">
            Non c’è ancora una bozza per il mese precedente. Dal 1° di questo
            mese puoi richiederla.
          </p>
          <button
            type="button"
            disabled={busyKey === "draft"}
            onClick={() => void handleRequestDraft()}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {busyKey === "draft" ? "Generazione…" : "Chiedi bozza"}
          </button>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-900">Le tue notule</h3>
        {payrolls.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
            Nessuna notula ancora. Quando il mese si chiude, compare qui la
            bozza da firmare.
          </p>
        ) : (
          <ul className="space-y-3">
            {payrolls.map((payroll) => {
              const locked =
                payroll.status === "signed" || payroll.status === "closed";
              return (
                <li key={payroll.id}>
                  <details className="rounded-xl border border-neutral-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-neutral-900">
                          {monthLabel(payroll.year, payroll.month)}
                        </p>
                        <p className="text-sm text-neutral-500">
                          {formatHours(payroll.minutesTeaching)} insegnamento
                          {payroll.minutesCoordination > 0
                            ? ` · ${formatHours(payroll.minutesCoordination)} coordinamento`
                            : ""}
                          {" · "}
                          {formatEuro(payroll.grossEur)} maturati
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[payroll.status]}`}
                      >
                        {STATUS_LABELS[payroll.status]}
                      </span>
                    </summary>

                    <div className="space-y-4 border-t border-neutral-100 px-4 py-4">
                      <LinesTable lines={payroll.lines} />
                      <Totals
                        grossEur={payroll.grossEur}
                        advancesEur={payroll.advancesEur}
                        netEur={payroll.netEur}
                        carryInEur={payroll.carryInEur}
                        carryOutEur={payroll.carryOutEur}
                        withholdingEur={payroll.withholdingEur}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void generateLessonPayrollPdf(payroll).then(
                            downloadLessonPayrollPdf,
                          );
                        }}
                        className="text-sm font-medium text-[var(--brand)] hover:underline"
                      >
                        Scarica PDF
                      </button>

                      {locked ? (
                        <p className="text-sm text-neutral-600">
                          {payroll.status === "closed"
                            ? "Mese chiuso."
                            : "Notula firmata."}
                          {payroll.signedAt
                            ? ` Firma del ${formatDateTimeIt(payroll.signedAt)}.`
                            : ""}
                          {payroll.hasInvoice && payroll.invoiceFilename
                            ? ` Fattura: ${payroll.invoiceFilename}.`
                            : payroll.hasInvoice
                              ? " Fattura allegata."
                              : ""}
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-sm text-neutral-600">
                            Firma sul canvas oppure carica la fattura (P.IVA),
                            poi invia.
                          </p>
                          <PayrollSignPad
                            ref={(node) => {
                              signPadRefs.current[payroll.id] = node;
                            }}
                            disabled={busyKey === payroll.id}
                            onCapture={(png) =>
                              setSignatures((prev) => ({
                                ...prev,
                                [payroll.id]: png,
                              }))
                            }
                          />
                          <label className="block text-sm">
                            <span className="mb-1 block text-neutral-600">
                              Fattura (PDF o immagine)
                            </span>
                            <input
                              type="file"
                              accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                              disabled={busyKey === payroll.id}
                              onChange={(event) =>
                                void handleInvoiceChange(
                                  payroll.id,
                                  event.target.files?.[0],
                                )
                              }
                              className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand)]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--brand)]"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={busyKey === payroll.id}
                            onClick={() => void handleSign(payroll)}
                            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                          >
                            {busyKey === payroll.id
                              ? "Invio…"
                              : "Firma / Invia fattura"}
                          </button>
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
