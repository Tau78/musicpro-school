"use client";

import { useCallback, useEffect, useState } from "react";

import {
  RECEIPTS_STATUS_LABELS,
  type MemberSummary,
  type ReimbursementDisplay,
  deleteReimbursement,
  formatEuro,
  formatReimbursementDateItalian,
  generateReimbursement,
  getCurrentMember,
  listReimbursements,
  updateReceiptsAmount,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface ReimbursementsPanelProps {
  initialYear: number;
  members: MemberSummary[];
  canDelete: boolean;
  isDocenteOnly: boolean;
}

const PAYMENT_METHODS = [
  "Contanti",
  "Bonifico",
  "PayPal",
  "Altro",
];

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

  const [generateMemberId, setGenerateMemberId] = useState("");
  const [generateAmount, setGenerateAmount] = useState("");
  const [generateMethod, setGenerateMethod] = useState(PAYMENT_METHODS[0]);
  const [generatePaymentDate, setGeneratePaymentDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ReimbursementDisplay | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const [editingReceiptsId, setEditingReceiptsId] = useState<string | null>(
    null,
  );
  const [editingReceiptsValue, setEditingReceiptsValue] = useState("");

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
        setGenerateMemberId(member.id);
      }
    });
  }, [isDocenteOnly, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleUpdateReceipts(id: string) {
    const amount = parseFloat(editingReceiptsValue.replace(",", "."));
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

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    const result = await deleteReimbursement(supabase, deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare il rimborso.");
      return;
    }

    void loadData();
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerateMessage(null);
    setError(null);

    if (!currentMemberId) {
      setError("Sessione non valida.");
      return;
    }

    const memberId = isDocenteOnly ? currentMemberId : generateMemberId;
    const amount = parseFloat(generateAmount.replace(",", "."));

    if (!memberId) {
      setError("Seleziona un associato.");
      return;
    }

    if (Number.isNaN(amount) || amount <= 0) {
      setError("Importo lordo non valido.");
      return;
    }

    setGenerating(true);

    const result = await generateReimbursement(
      supabase,
      {
        memberId,
        fiscalYear: year,
        grossAmountEur: amount,
        paymentMethod: generateMethod,
        paymentDate: generatePaymentDate || undefined,
      },
      currentMemberId,
    );

    setGenerating(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante la generazione.");
      return;
    }

    setGenerateMessage(
      "Rimborso registrato. TODO: generazione PDF da template Google Docs → Supabase Storage.",
    );
    setGenerateAmount("");
    void loadData();
  }

  const yearOptions = Array.from({ length: 6 }, (_, i) => initialYear - i);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-end">
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
          <Field label="Associato (filtro)">
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

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Genera rimborso
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Registra un nuovo rimborso. La generazione PDF (ex Google Docs) è in
          TODO.
        </p>

        <form
          onSubmit={(e) => void handleGenerate(e)}
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {!isDocenteOnly ? (
            <Field label="Associato *">
              <select
                required
                value={generateMemberId}
                onChange={(e) => setGenerateMemberId(e.target.value)}
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
              value={generateAmount}
              onChange={(e) => setGenerateAmount(e.target.value)}
              placeholder="0,00"
              className={inputClass}
            />
          </Field>

          <Field label="Metodo pagamento *">
            <select
              value={generateMethod}
              onChange={(e) => setGenerateMethod(e.target.value)}
              className={selectClass}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Data pagamento">
            <input
              type="date"
              value={generatePaymentDate}
              onChange={(e) => setGeneratePaymentDate(e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={generating}
              className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {generating ? "Generazione…" : "Genera rimborso"}
            </button>
          </div>
        </form>

        {generateMessage ? (
          <p className="mt-3 text-sm text-green-700">{generateMessage}</p>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Elenco rimborsi
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Caricamento…</p>
        ) : reimbursements.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            Nessun rimborso per i filtri selezionati.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Associato</th>
                  <th className="px-4 py-3 font-medium">Prog.</th>
                  <th className="px-4 py-3 font-medium">Importo</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Ricevute</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  {canDelete ? (
                    <th className="px-4 py-3 font-medium">Azioni</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {reimbursements.map((item) => (
                  <tr key={item.id} className="text-neutral-800">
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
                    {canDelete ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
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
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Conferma eliminazione</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Eliminare il rimborso {deleteTarget.progressive}/{deleteTarget.fiscalYear}{" "}
              di {deleteTarget.associateName}?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Eliminazione…" : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* TODO: quote bulk, settings, messaggistica massiva, import wizard, reports */}
    </div>
  );
}

function StatusBadge({ status }: { status: ReimbursementDisplay["receiptsStatus"] }) {
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
