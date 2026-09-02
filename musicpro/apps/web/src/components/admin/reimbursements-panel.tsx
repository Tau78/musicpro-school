"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_PAYMENT_METHODS,
  RECEIPTS_STATUS_LABELS,
  deleteReimbursements,
  formatEuro,
  formatPaymentMethodString,
  formatReimbursementDateItalian,
  generateReimbursementsBatch,
  getCurrentMember,
  getMemberReceiptsBalance,
  isExternalPdfUrl,
  listReimbursements,
  paymentPartsMatchGross,
  updateReceiptsAmount,
  type MemberSummary,
  type PaymentPart,
  type ReimbursementDisplay,
} from "@musicpro/database";

import { CollapsibleSection } from "@/components/admin/collapsible-section";
import {
  generateReimbursementHtml,
  openPrintableNotula,
} from "@/lib/reimbursements/pdf";
import { createClient } from "@/lib/supabase/client";

interface ReimbursementsPanelProps {
  initialYear: number;
  members: MemberSummary[];
  canDelete: boolean;
  isDocenteOnly: boolean;
}

interface PaymentLineState {
  id: string;
  method: string;
  amount: string;
}

interface GenerateCardState {
  id: string;
  memberId: string;
  amount: string;
  receiptsAmount: string;
  paymentDate: string;
  paymentLines: PaymentLineState[];
  sendEmail: boolean;
  useSurplus: boolean;
  balanceEur: number | null;
  balanceLoading: boolean;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseAmount(value: string): number {
  const n = parseFloat(value.replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
}

function defaultPaymentLines(): PaymentLineState[] {
  return [
    {
      id: newId(),
      method: DEFAULT_PAYMENT_METHODS[0],
      amount: "",
    },
  ];
}

function createEmptyCard(memberId = ""): GenerateCardState {
  return {
    id: newId(),
    memberId,
    amount: "",
    receiptsAmount: "",
    paymentDate: todayIsoDate(),
    paymentLines: defaultPaymentLines(),
    sendEmail: true,
    useSurplus: false,
    balanceEur: null,
    balanceLoading: false,
  };
}

export function ReimbursementsPanel({
  initialYear,
  members,
  canDelete,
  isDocenteOnly,
}: ReimbursementsPanelProps) {
  const supabase = createClient();

  const [year, setYear] = useState(initialYear);
  const [memberFilter, setMemberFilter] = useState("");
  const [reimbursements, setReimbursements] = useState<ReimbursementDisplay[]>(
    [],
  );
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);

  const [cards, setCards] = useState<GenerateCardState[]>([createEmptyCard()]);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [editingReceiptsId, setEditingReceiptsId] = useState<string | null>(
    null,
  );
  const [editingReceiptsValue, setEditingReceiptsValue] = useState("");

  const [reportYear, setReportYear] = useState(initialYear);
  const [reportMemberId, setReportMemberId] = useState("");
  const [reportRows, setReportRows] = useState<ReimbursementDisplay[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listReimbursements(supabase, {
        fiscalYear: year,
        memberId: memberFilter || undefined,
      });
      setReimbursements(result.reimbursements);
      setTotalAmount(result.totalAmountEur);
      setSelectedIds(new Set());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento rimborsi",
      );
    } finally {
      setLoading(false);
    }
  }, [memberFilter, supabase, year]);

  useEffect(() => {
    void getCurrentMember(supabase).then((member) => {
      setCurrentMemberId(member?.id ?? null);
      if (isDocenteOnly && member) {
        setMemberFilter(member.id);
        const card = createEmptyCard(member.id);
        setCards([card]);
        setReportMemberId(member.id);
        void getMemberReceiptsBalance(supabase, member.id)
          .then((bal) => {
            setCards((prev) =>
              prev.map((c) =>
                c.id === card.id
                  ? { ...c, balanceEur: bal.balanceEur, balanceLoading: false }
                  : c,
              ),
            );
          })
          .catch(() => {
            /* ignore */
          });
      }
    });
  }, [isDocenteOnly, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateCard = useCallback(
    (cardId: string, patch: Partial<GenerateCardState>) => {
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const refreshBalance = useCallback(
    async (cardId: string, memberId: string) => {
      if (!memberId) {
        updateCard(cardId, { balanceEur: null, useSurplus: false });
        return;
      }
      updateCard(cardId, { balanceLoading: true });
      try {
        const bal = await getMemberReceiptsBalance(supabase, memberId);
        updateCard(cardId, {
          balanceEur: bal.balanceEur,
          balanceLoading: false,
          useSurplus: false,
        });
      } catch {
        updateCard(cardId, {
          balanceEur: null,
          balanceLoading: false,
          useSurplus: false,
        });
      }
    },
    [supabase, updateCard],
  );

  function applySurplusToReceipts(card: GenerateCardState, use: boolean) {
    const gross = parseAmount(card.amount);
    const surplus = card.balanceEur ?? 0;
    if (!use || !(surplus > 0) || Number.isNaN(gross)) {
      return card.receiptsAmount;
    }
    const calc = Math.max(0, gross - surplus);
    return calc.toFixed(2).replace(".", ",");
  }

  async function handleUpdateReceipts(id: string) {
    const amount = parseAmount(editingReceiptsValue);
    if (Number.isNaN(amount) || amount < 0) {
      setError("Importo ricevute non valido.");
      return;
    }

    const result = await updateReceiptsAmount(supabase, id, amount);
    if (!result.success) {
      setError(result.errorMessage ?? "Errore aggiornamento ricevute.");
      return;
    }

    setEditingReceiptsId(null);
    void loadData();
  }

  async function handleGenerate() {
    setGenerateMessage(null);
    setError(null);

    if (!currentMemberId) {
      setError("Sessione non valida.");
      return;
    }

    const inputs: Array<{
      memberId: string;
      fiscalYear: number;
      grossAmountEur: number;
      paymentMethod: string;
      paymentDate?: string;
      receiptsAmountEur?: number;
      sendEmail: boolean;
    }> = [];

    for (const card of cards) {
      const memberId = isDocenteOnly ? currentMemberId : card.memberId;
      const amount = parseAmount(card.amount);
      let receipts = parseAmount(card.receiptsAmount);
      if (Number.isNaN(receipts)) receipts = amount;

      const parts: PaymentPart[] = card.paymentLines
        .map((line) => ({
          method: line.method,
          amount: parseAmount(line.amount),
        }))
        .filter((p) => p.method && !Number.isNaN(p.amount) && p.amount > 0);

      if (
        !memberId ||
        Number.isNaN(amount) ||
        amount <= 0 ||
        !card.paymentDate ||
        parts.length === 0 ||
        !paymentPartsMatchGross(parts, amount)
      ) {
        setError(
          "Alcune schede non sono complete o la somma dei pagamenti non corrisponde al totale (±0,01).",
        );
        return;
      }

      inputs.push({
        memberId,
        fiscalYear: year,
        grossAmountEur: amount,
        paymentMethod: formatPaymentMethodString(parts),
        paymentDate: card.paymentDate,
        receiptsAmountEur: receipts,
        sendEmail: card.sendEmail,
      });
    }

    setGenerating(true);

    try {
      const batch = await generateReimbursementsBatch(
        supabase,
        inputs.map(({ sendEmail: _s, ...rest }) => rest),
        currentMemberId,
      );

      if (batch.createdIds.length === 0) {
        setError(batch.errorMessage ?? "Nessun rimborso generato.");
        setGenerating(false);
        return;
      }

      let pdfOk = 0;
      let pdfFailed = 0;
      let emailSent = 0;
      let emailSkipped = 0;
      let emailFailed = 0;
      const flowErrors: string[] = [];

      for (let i = 0; i < batch.results.length; i++) {
        const result = batch.results[i];
        const input = inputs[i];
        if (!result?.success || !result.id || !input) continue;
        const id = result.id;

        try {
          const pdfRes = await fetch(
            `/api/admin/reimbursements/${encodeURIComponent(id)}/pdf`,
            { method: "POST" },
          );
          const pdfPayload = (await pdfRes.json().catch(() => ({}))) as {
            success?: boolean;
            message?: string;
            driveError?: string;
            storageError?: string;
          };
          if (pdfRes.ok && pdfPayload.success) {
            pdfOk += 1;
            if (pdfPayload.driveError) {
              flowErrors.push(`Drive: ${pdfPayload.driveError}`);
            }
          } else {
            pdfFailed += 1;
            if (pdfPayload.message) flowErrors.push(pdfPayload.message);
          }
        } catch (err) {
          pdfFailed += 1;
          flowErrors.push(
            err instanceof Error ? err.message : "Errore generazione PDF",
          );
        }

        if (input.sendEmail) {
          try {
            const emailRes = await fetch(
              `/api/admin/reimbursements/${encodeURIComponent(id)}/email`,
              { method: "POST" },
            );
            const payload = (await emailRes.json().catch(() => ({}))) as {
              sent?: boolean;
              skipped?: boolean;
              message?: string;
            };
            if (payload.sent) emailSent += 1;
            else if (payload.skipped) emailSkipped += 1;
            else {
              emailFailed += 1;
              if (payload.message) flowErrors.push(payload.message);
            }
          } catch (err) {
            emailFailed += 1;
            flowErrors.push(
              err instanceof Error ? err.message : "Errore invio email docente",
            );
          }
        }
      }

      const partsMsg = [
        `${batch.createdIds.length} rimborso/i registrato/i`,
        pdfOk ? `${pdfOk} PDF` : null,
        pdfFailed ? `${pdfFailed} PDF NON generati` : null,
        emailSent ? `${emailSent} email inviate` : null,
        emailSkipped ? `${emailSkipped} senza email docente` : null,
        emailFailed ? `${emailFailed} email NON inviate` : null,
        batch.success ? null : "(alcuni errori in generazione)",
      ].filter(Boolean);

      setGenerateMessage(partsMsg.join(" · "));
      if (pdfFailed > 0 || emailFailed > 0 || flowErrors.length > 0) {
        setError(
          flowErrors[0] ??
            "PDF o email non completati. Riprova da Genera PDF o controlla RESEND_API_KEY.",
        );
      }
      setCards([
        createEmptyCard(isDocenteOnly ? (currentMemberId ?? "") : ""),
      ]);
      void loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante la generazione.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleBulkDelete() {
    if (!canDelete || selectedIds.size === 0) return;
    setBulkBusy(true);
    const result = await deleteReimbursements(supabase, [...selectedIds]);
    setBulkBusy(false);
    setDeleteConfirm(false);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare i rimborsi.");
      return;
    }
    void loadData();
  }

  async function handleBulkEmail() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reimbursements/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const payload = (await res.json()) as {
        success?: boolean;
        sent?: number;
        skipped?: number;
        failed?: number;
        message?: string;
      };
      if ((payload.failed ?? 0) > 0 || (!res.ok && !payload.success)) {
        setError(
          payload.message ??
            "Errore invio email. Controlla RESEND_API_KEY e gli indirizzi associati.",
        );
      }
      setGenerateMessage(
        `Email bulk: ${payload.sent ?? 0} inviate, ${payload.skipped ?? 0} senza email associato, ${payload.failed ?? 0} errori.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore email bulk.");
    } finally {
      setBulkBusy(false);
    }
  }

  function openInPreview(
    preview: Window | null,
    url: string,
  ): boolean {
    if (preview && !preview.closed) {
      preview.location.href = url;
      return true;
    }
    const fallback = window.open(url, "_blank", "noopener,noreferrer");
    return Boolean(fallback);
  }

  function pdfUrlFromPayload(payload: {
    pdfUrl?: string | null;
    pdfBase64?: string;
  }): string | null {
    if (payload.pdfUrl && !payload.pdfUrl.startsWith("data:")) {
      return payload.pdfUrl;
    }
    if (payload.pdfBase64) {
      const bin = atob(payload.pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    }
    if (payload.pdfUrl?.startsWith("data:application/pdf")) {
      const comma = payload.pdfUrl.indexOf(",");
      if (comma > 0) {
        return pdfUrlFromPayload({ pdfBase64: payload.pdfUrl.slice(comma + 1) });
      }
    }
    return null;
  }

  async function openPdf(item: ReimbursementDisplay) {
    setError(null);
    setPdfBusyId(item.id);
    const preview = window.open("about:blank", "_blank");

    type PdfPayload = {
      pdfUrl?: string | null;
      pdfBase64?: string;
      success?: boolean;
      message?: string;
    };

    const fetchPdf = async (method: "GET" | "POST") => {
      const res = await fetch(
        `/api/admin/reimbursements/${encodeURIComponent(item.id)}/pdf`,
        { method },
      );
      const payload = (await res.json().catch(() => ({}))) as PdfPayload;
      return { ok: res.ok, payload };
    };

    try {
      if (item.pdfUrl && isExternalPdfUrl(item.pdfUrl)) {
        if (!openInPreview(preview, item.pdfUrl)) {
          setError("Il browser ha bloccato il PDF. Consenti i popup per questa pagina.");
        }
        return;
      }

      let { payload } =
        item.pdfStoragePath || item.pdfUrl
          ? await fetchPdf("GET")
          : { payload: { success: false } as PdfPayload };
      if (!payload.pdfUrl && !payload.pdfBase64) {
        const generated = await fetchPdf("POST");
        payload = generated.payload;
        void loadData();
        if (!generated.ok && !payload.pdfBase64 && !payload.pdfUrl) {
          setError(payload.message ?? "Impossibile generare il PDF.");
        }
      }

      const url = pdfUrlFromPayload(payload);
      if (url) {
        if (!openInPreview(preview, url)) {
          setError("Il browser ha bloccato il PDF. Consenti i popup per questa pagina.");
        }
        return;
      }

      preview?.close();
      if (payload.message) setError(payload.message);
      openPrintableNotula(
        generateReimbursementHtml({
          progressive: item.progressive,
          fiscalYear: item.fiscalYear,
          associateName: item.associateName,
          grossAmountEur: item.grossAmountEur,
          paymentMethod: item.paymentMethod,
          paymentDate: item.paymentDate,
          receiptsAmountEur: item.receiptsAmountEur,
          receiptsNote: item.receiptsNotes,
          generatedAt: item.generatedAt,
          signedAt: item.signedAt,
        }),
      );
    } catch (err) {
      preview?.close();
      setError(
        err instanceof Error ? err.message : "Errore durante l'apertura del PDF.",
      );
    } finally {
      setPdfBusyId(null);
    }
  }

  async function loadReport() {
    setReportLoading(true);
    try {
      const result = await listReimbursements(supabase, {
        fiscalYear: reportYear,
        memberId:
          (isDocenteOnly ? currentMemberId : reportMemberId) || undefined,
      });
      setReportRows(result.reimbursements);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore caricamento report.",
      );
    } finally {
      setReportLoading(false);
    }
  }

  const reportSummary = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const row of reportRows) {
      const prev = map.get(row.memberId);
      if (prev) {
        prev.total += row.grossAmountEur;
      } else {
        map.set(row.memberId, {
          name: row.associateName,
          total: row.grossAmountEur,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [reportRows]);

  const reportGrandTotal = reportRows.reduce(
    (s, r) => s + r.grossAmountEur,
    0,
  );

  function downloadCsv(kind: "summary" | "detailed") {
    const lines: string[] = [];
    if (kind === "summary") {
      lines.push("Associato;Totale");
      for (const row of reportSummary) {
        lines.push(
          `${csvEscape(row.name)};${row.total.toFixed(2).replace(".", ",")}`,
        );
      }
      lines.push(`TOTALE;${reportGrandTotal.toFixed(2).replace(".", ",")}`);
    } else {
      lines.push(
        "Associato;Anno;Progressivo;Importo;Data;Ricevute;Stato;Pagamento;Data pagamento",
      );
      for (const row of reportRows) {
        lines.push(
          [
            csvEscape(row.associateName),
            row.fiscalYear,
            row.progressive,
            row.grossAmountEur.toFixed(2).replace(".", ","),
            formatReimbursementDateItalian(row.generatedAt),
            row.receiptsAmountEur.toFixed(2).replace(".", ","),
            RECEIPTS_STATUS_LABELS[row.receiptsStatus],
            csvEscape(row.paymentMethod ?? ""),
            row.paymentDate ?? "",
          ].join(";"),
        );
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      kind === "summary"
        ? `report-totale-rimborsi-${reportYear}.csv`
        : `report-dettagliato-rimborsi-${reportYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openPrintableReport(kind: "summary" | "detailed") {
    const title =
      kind === "summary"
        ? `REPORT TOTALE RIMBORSI ANNO ${reportYear}`
        : `REPORT DETTAGLIATO RIMBORSI ANNO ${reportYear}`;

    let body = "";
    if (kind === "summary") {
      body = `<table><thead><tr><th>Associato</th><th>Totale</th></tr></thead><tbody>${reportSummary
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(formatEuro(r.total))}</td></tr>`,
        )
        .join("")}<tr><td><strong>TOTALE</strong></td><td><strong>${escapeHtml(formatEuro(reportGrandTotal))}</strong></td></tr></tbody></table>`;
    } else {
      body = `<table><thead><tr><th>Associato</th><th>Prog.</th><th>Importo</th><th>Data</th><th>Ricevute</th><th>Stato</th></tr></thead><tbody>${reportRows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.associateName)}</td><td>${escapeHtml(r.progressive)}</td><td>${escapeHtml(formatEuro(r.grossAmountEur))}</td><td>${escapeHtml(formatReimbursementDateItalian(r.generatedAt))}</td><td>${escapeHtml(formatEuro(r.receiptsAmountEur))}</td><td>${escapeHtml(RECEIPTS_STATUS_LABELS[r.receiptsStatus])}</td></tr>`,
        )
        .join("")}</tbody></table>`;
    }

    openPrintableNotula(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}</style>
      </head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`);
  }

  const allSelected =
    reimbursements.length > 0 &&
    reimbursements.every((r) => selectedIds.has(r.id));

  const yearOptions = Array.from({ length: 6 }, (_, i) => initialYear - i);

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {generateMessage ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {generateMessage}
        </p>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand)]">
              Genera rimborsi
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Una o più notule. I pagamenti parziali devono sommare l&apos;importo
              lordo.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setCards((prev) => [
                ...prev,
                createEmptyCard(isDocenteOnly ? (currentMemberId ?? "") : ""),
              ])
            }
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            + Aggiungi scheda
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {cards.map((card, index) => (
            <GenerateCard
              key={card.id}
              index={index}
              card={card}
              members={members}
              isDocenteOnly={isDocenteOnly}
              canRemove={cards.length > 1}
              onRemove={() =>
                setCards((prev) => prev.filter((c) => c.id !== card.id))
              }
              onChange={(patch) => updateCard(card.id, patch)}
              onMemberChange={(memberId) => {
                updateCard(card.id, { memberId });
                void refreshBalance(card.id, memberId);
              }}
              onToggleSurplus={(use) => {
                const receiptsAmount = applySurplusToReceipts(card, use);
                updateCard(card.id, { useSurplus: use, receiptsAmount });
              }}
              onGrossBlur={() => {
                if (card.useSurplus) {
                  updateCard(card.id, {
                    receiptsAmount: applySurplusToReceipts(card, true),
                  });
                } else if (!card.receiptsAmount.trim() && card.amount.trim()) {
                  updateCard(card.id, { receiptsAmount: card.amount });
                }
                // Sync first payment line if alone and empty
                if (
                  card.paymentLines.length === 1 &&
                  !card.paymentLines[0]?.amount.trim() &&
                  card.amount.trim()
                ) {
                  updateCard(card.id, {
                    paymentLines: [
                      { ...card.paymentLines[0]!, amount: card.amount },
                    ],
                  });
                }
              }}
            />
          ))}
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGenerate()}
            className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {generating
              ? "Generazione…"
              : `Genera ${cards.length}`}
          </button>
        </div>
      </section>

      <CollapsibleSection
        title="Elenco rimborsi"
        defaultOpen={false}
        description={
          loading
            ? "Caricamento…"
            : `${reimbursements.length} notul${reimbursements.length === 1 ? "a" : "e"} · ${formatEuro(totalAmount)}`
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label="Anno">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={selectClass}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>

          {!isDocenteOnly ? (
            <Field label="Associato">
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className={selectClass}
              >
                <option value="">Tutti</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.lastName} {member.firstName}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <p className="text-sm text-neutral-600 sm:ml-auto">
            Totale:{" "}
            <strong className="text-[var(--brand)]">
              {formatEuro(totalAmount)}
            </strong>
          </p>
        </div>

        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-sm text-neutral-600">
              {selectedIds.size} selezionati
            </span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkEmail()}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Invia email
            </button>
            {canDelete ? (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setDeleteConfirm(true)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Elimina
              </button>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-neutral-500">Caricamento…</p>
        ) : reimbursements.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nessun rimborso per i filtri selezionati.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(
                            new Set(reimbursements.map((r) => r.id)),
                          );
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      aria-label="Seleziona tutti"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Associato</th>
                  <th className="px-4 py-3 font-medium">Prog.</th>
                  <th className="px-4 py-3 font-medium">Importo</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Ricevute</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Firma</th>
                  <th className="px-4 py-3 font-medium">PDF</th>
                  {canDelete ? (
                    <th className="px-4 py-3 font-medium">Azioni</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {reimbursements.map((item) => (
                  <tr key={item.id} className="text-neutral-800">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                        aria-label={`Seleziona ${item.progressive}`}
                      />
                    </td>
                    <td className="px-4 py-3">{item.associateName}</td>
                    <td className="px-4 py-3">{item.progressive}</td>
                    <td className="px-4 py-3">
                      {formatEuro(item.grossAmountEur)}
                    </td>
                    <td className="px-4 py-3">
                      {formatReimbursementDateItalian(item.generatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {editingReceiptsId === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editingReceiptsValue}
                            onChange={(e) =>
                              setEditingReceiptsValue(e.target.value)
                            }
                            className="w-24 rounded border border-neutral-300 px-2 py-1"
                          />
                          <button
                            type="button"
                            onClick={() => void handleUpdateReceipts(item.id)}
                            className="text-[var(--brand)] hover:underline"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingReceiptsId(null)}
                            className="text-neutral-500 hover:underline"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingReceiptsId(item.id);
                            setEditingReceiptsValue(
                              item.receiptsAmountEur.toFixed(2),
                            );
                          }}
                          className="text-left hover:text-[var(--brand)]"
                          title="Modifica importo ricevute cartacee"
                        >
                          {formatEuro(item.receiptsAmountEur)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.receiptsStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {item.signedAt ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Firmata {formatReimbursementDateItalian(item.signedAt)}
                        </span>
                      ) : item.signatureRequired ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Da firmare
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={pdfBusyId === item.id}
                        onClick={() => void openPdf(item)}
                        className="text-[var(--brand)] hover:underline disabled:opacity-50"
                      >
                        {pdfBusyId === item.id
                          ? "Generazione…"
                          : item.pdfUrl || item.pdfStoragePath
                            ? "Visualizza PDF"
                            : "Genera PDF"}
                      </button>
                    </td>
                    {canDelete ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIds(new Set([item.id]));
                            setDeleteConfirm(true);
                          }}
                          className="text-red-600 hover:underline"
                        >
                          Elimina
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Report rimborsi"
        defaultOpen={false}
        description="Esporta CSV o apri una versione stampabile (totale / dettagliato)."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label="Anno report">
            <select
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
              className={selectClass}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
          {!isDocenteOnly ? (
            <Field label="Associato (opzionale)">
              <select
                value={reportMemberId}
                onChange={(e) => setReportMemberId(e.target.value)}
                className={selectClass}
              >
                <option value="">Tutti</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.lastName} {member.firstName}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <button
            type="button"
            disabled={reportLoading}
            onClick={() => void loadReport()}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {reportLoading ? "Caricamento…" : "Carica dati"}
          </button>
        </div>

        {reportRows.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              {reportRows.length} righe · Totale{" "}
              <strong>{formatEuro(reportGrandTotal)}</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadCsv("summary")}
                className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand)]/90"
              >
                CSV totale
              </button>
              <button
                type="button"
                onClick={() => downloadCsv("detailed")}
                className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand)]/90"
              >
                CSV dettagliato
              </button>
              <button
                type="button"
                onClick={() => openPrintableReport("summary")}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Stampa totale
              </button>
              <button
                type="button"
                onClick={() => openPrintableReport("detailed")}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Stampa dettagliato
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            Carica i dati per esportare il report.
          </p>
        )}
      </CollapsibleSection>

      {deleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Conferma eliminazione</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Eliminare {selectedIds.size} rimborso/i selezionati?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {bulkBusy ? "Eliminazione…" : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GenerateCard({
  index,
  card,
  members,
  isDocenteOnly,
  canRemove,
  onRemove,
  onChange,
  onMemberChange,
  onToggleSurplus,
  onGrossBlur,
}: {
  index: number;
  card: GenerateCardState;
  members: MemberSummary[];
  isDocenteOnly: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<GenerateCardState>) => void;
  onMemberChange: (memberId: string) => void;
  onToggleSurplus: (use: boolean) => void;
  onGrossBlur: () => void;
}) {
  const parts: PaymentPart[] = card.paymentLines.map((line) => ({
    method: line.method,
    amount: parseAmount(line.amount) || 0,
  }));
  const gross = parseAmount(card.amount);
  const sumOk =
    !Number.isNaN(gross) &&
    gross > 0 &&
    parts.some((p) => p.amount > 0) &&
    paymentPartsMatchGross(
      parts.filter((p) => p.amount > 0),
      gross,
    );
  const showMismatch =
    !Number.isNaN(gross) &&
    gross > 0 &&
    parts.some((p) => p.amount > 0) &&
    !sumOk;

  const balance = card.balanceEur;
  const showSurplus = balance != null && balance > 0.009;
  const showDebt = balance != null && balance < -0.009;

  function updateLine(lineId: string, patch: Partial<PaymentLineState>) {
    onChange({
      paymentLines: card.paymentLines.map((l) =>
        l.id === lineId ? { ...l, ...patch } : l,
      ),
    });
  }

  return (
    <div className="relative rounded-lg border border-neutral-200 bg-neutral-50/50 p-4">
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-3 top-3 text-neutral-400 hover:text-red-600"
          title="Rimuovi scheda"
        >
          ✕
        </button>
      ) : null}

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Scheda {index + 1}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!isDocenteOnly ? (
          <Field label="Associato *">
            <select
              required
              value={card.memberId}
              onChange={(e) => onMemberChange(e.target.value)}
              className={selectClass}
            >
              <option value="">Seleziona…</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.lastName} {member.firstName}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Importo lordo (€) *">
          <input
            required
            type="text"
            inputMode="decimal"
            value={card.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            onBlur={onGrossBlur}
            placeholder="0,00"
            className={inputClass}
          />
        </Field>

        <Field label="Importo ricevute (€)">
          <input
            type="text"
            inputMode="decimal"
            value={card.receiptsAmount}
            onChange={(e) => onChange({ receiptsAmount: e.target.value })}
            placeholder="Uguale al lordo"
            className={inputClass}
          />
        </Field>

        <Field label="Data pagamento *">
          <input
            type="date"
            required
            value={card.paymentDate}
            onChange={(e) => onChange({ paymentDate: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      {card.balanceLoading ? (
        <p className="mt-3 text-xs text-neutral-500">Calcolo saldo ricevute…</p>
      ) : null}

      {showSurplus ? (
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <input
            type="checkbox"
            checked={card.useSurplus}
            onChange={(e) => onToggleSurplus(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Disponibili{" "}
            <strong>{formatEuro(balance!)}</strong> di scontrini precedenti.
            Usali ora.
          </span>
        </label>
      ) : null}

      {showDebt ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Attenzione: mancano{" "}
          <strong className="text-red-700">
            {formatEuro(Math.abs(balance!))}
          </strong>{" "}
          di ricevute da rimborsi passati.
        </p>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-neutral-700">
          Dettagli pagamento
        </p>
        <div className="space-y-2">
          {card.paymentLines.map((line, lineIndex) => (
            <div key={line.id} className="flex flex-wrap items-end gap-2">
              <label className="min-w-[180px] flex-1 text-sm">
                <span className="mb-1 block text-neutral-600">Metodo</span>
                <select
                  value={line.method}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__custom__") {
                      const custom = window.prompt("Nuovo metodo di pagamento:");
                      if (custom?.trim()) {
                        updateLine(line.id, { method: custom.trim() });
                      }
                      return;
                    }
                    updateLine(line.id, { method: value });
                  }}
                  className={selectClass}
                >
                  {DEFAULT_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {!DEFAULT_PAYMENT_METHODS.includes(
                    line.method as (typeof DEFAULT_PAYMENT_METHODS)[number],
                  ) ? (
                    <option value={line.method}>{line.method}</option>
                  ) : null}
                  <option value="__custom__">Aggiungi altro…</option>
                </select>
              </label>
              <label className="w-32 text-sm">
                <span className="mb-1 block text-neutral-600">Importo</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(e) =>
                    updateLine(line.id, { amount: e.target.value })
                  }
                  placeholder="0,00"
                  className={inputClass}
                />
              </label>
              <div className="flex gap-1 pb-0.5">
                {lineIndex === card.paymentLines.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        paymentLines: [
                          ...card.paymentLines,
                          {
                            id: newId(),
                            method: DEFAULT_PAYMENT_METHODS[0],
                            amount: "",
                          },
                        ],
                      })
                    }
                    className="rounded border border-neutral-300 px-2 py-2 text-sm hover:bg-white"
                    title="Aggiungi riga"
                  >
                    +
                  </button>
                ) : null}
                {card.paymentLines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        paymentLines: card.paymentLines.filter(
                          (l) => l.id !== line.id,
                        ),
                      })
                    }
                    className="rounded border border-red-200 px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                    title="Rimuovi riga"
                  >
                    −
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {showMismatch ? (
          <p className="mt-2 text-right text-sm font-medium text-red-600">
            La somma dei parziali non corrisponde al totale.
          </p>
        ) : null}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={card.sendEmail}
          onChange={(e) => onChange({ sendEmail: e.target.checked })}
        />
        Invia email notula
      </label>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ReimbursementDisplay["receiptsStatus"];
}) {
  const colors = {
    mancante: "bg-red-100 text-red-700",
    parziale: "bg-amber-100 text-amber-800",
    completo: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}
    >
      {RECEIPTS_STATUS_LABELS[status]}
    </span>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

const selectClass = inputClass;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-[140px] flex-1 text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function csvEscape(value: string): string {
  if (/[;"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
