"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  type AnnualQuotaSetting,
  type AnnualQuotaSettingInput,
  type MemberAnnualQuota,
  type MemberSummary,
  createAnnualQuotaSetting,
  currentFiscalYear,
  deleteAnnualQuotaSetting,
  formatQuotaDateItalian,
  formatQuotaEuro,
  updateAnnualQuotaSetting,
  upsertMemberAnnualQuotas,
} from "@musicpro/database";

import {
  FieldLabel,
  SettingsTabs,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

interface QuotasPanelProps {
  settings: AnnualQuotaSetting[];
  members: MemberSummary[];
  existingQuotas: MemberAnnualQuota[];
}

type BulkRow = {
  key: string;
  memberId: string;
  fiscalYear: number;
  paidAt: string;
  locked: boolean;
};

type QuotaTab = "impostazioni" | "registrazione";

function emptySettingInput(defaultYear: number): AnnualQuotaSettingInput {
  return {
    fiscalYear: defaultYear,
    amountEur: 0,
  };
}

function memberLabel(member: MemberSummary): string {
  const number =
    member.memberNumber != null ? `#${member.memberNumber} ` : "";
  return `${number}${member.lastName} ${member.firstName}`.trim();
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function newBulkRow(fiscalYear: number, paidAt = ""): BulkRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    memberId: "",
    fiscalYear,
    paidAt,
    locked: false,
  };
}

export function QuotasPanel({
  settings,
  members,
  existingQuotas,
}: QuotasPanelProps) {
  const router = useRouter();
  const supabase = createClient();
  const defaultYear = settings[0]?.fiscalYear ?? currentFiscalYear();

  const amountByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const setting of settings) {
      map.set(setting.fiscalYear, setting.amountEur);
    }
    return map;
  }, [settings]);

  const quotaByMemberYear = useMemo(() => {
    const map = new Map<string, MemberAnnualQuota>();
    for (const quota of existingQuotas) {
      map.set(`${quota.memberId}:${quota.fiscalYear}`, quota);
    }
    return map;
  }, [existingQuotas]);

  const [tab, setTab] = useState<QuotaTab>("impostazioni");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingForm, setSettingForm] = useState<AnnualQuotaSettingInput>(
    emptySettingInput(defaultYear),
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [bulkRows, setBulkRows] = useState<BulkRow[]>([
    newBulkRow(defaultYear, toDateInputValue(new Date().toISOString())),
  ]);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(
          `${b.lastName} ${b.firstName}`,
          "it",
        ),
      ),
    [members],
  );

  function updateSettingField<K extends keyof AnnualQuotaSettingInput>(
    key: K,
    value: AnnualQuotaSettingInput[K],
  ) {
    setSettingForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEditSetting(setting: AnnualQuotaSetting) {
    setEditingId(setting.id);
    setSettingForm({
      fiscalYear: setting.fiscalYear,
      amountEur: setting.amountEur,
    });
    setTab("impostazioni");
    setError(null);
    setSuccess(null);
  }

  function cancelEditSetting() {
    setEditingId(null);
    setSettingForm(emptySettingInput(defaultYear));
    setError(null);
  }

  async function handleSettingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    setError(null);
    setSuccess(null);

    const result = editingId
      ? await updateAnnualQuotaSetting(supabase, editingId, settingForm)
      : await createAnnualQuotaSetting(supabase, settingForm);

    setSettingsSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess(
      editingId ? "Impostazione aggiornata." : "Impostazione creata.",
    );
    setEditingId(null);
    setSettingForm(emptySettingInput(settingForm.fiscalYear + 1));
    router.refresh();
  }

  async function handleDeleteSetting(settingId: string) {
    setDeletingId(settingId);
    setError(null);
    setSuccess(null);

    const result = await deleteAnnualQuotaSetting(supabase, settingId);
    setDeletingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare l'impostazione.");
      return;
    }

    if (editingId === settingId) {
      cancelEditSetting();
    }

    setSuccess("Impostazione eliminata.");
    router.refresh();
  }

  function updateBulkRow(key: string, patch: Partial<BulkRow>) {
    setBulkRows((rows) =>
      rows.map((row) => {
        if (row.key !== key || row.locked) return row;

        const next = { ...row, ...patch };
        const existing = quotaByMemberYear.get(
          `${next.memberId}:${next.fiscalYear}`,
        );

        if (existing?.paidAt) {
          return {
            ...next,
            paidAt: toDateInputValue(existing.paidAt),
            locked: true,
          };
        }

        return { ...next, locked: false };
      }),
    );
  }

  function addBulkRow() {
    setBulkRows((rows) => [
      ...rows,
      newBulkRow(defaultYear, toDateInputValue(new Date().toISOString())),
    ]);
  }

  function removeBulkRow(key: string) {
    setBulkRows((rows) => {
      if (rows.length <= 1) return rows;
      return rows.filter((row) => row.key !== key);
    });
  }

  async function handleBulkSave(e: React.FormEvent) {
    e.preventDefault();
    setBulkSaving(true);
    setError(null);
    setSuccess(null);

    const editable = bulkRows.filter((row) => !row.locked);
    if (editable.length === 0) {
      setError("Nessuna nuova riga da salvare (le quote già pagate sono bloccate).");
      setBulkSaving(false);
      return;
    }

    for (const row of editable) {
      if (!row.memberId) {
        setError("Seleziona un associato per ogni riga.");
        setBulkSaving(false);
        return;
      }
      if (!amountByYear.has(row.fiscalYear)) {
        setError(
          `Manca l'importo impostato per l'anno ${row.fiscalYear}. Aggiungilo nelle impostazioni.`,
        );
        setBulkSaving(false);
        return;
      }
      if (!row.paidAt) {
        setError("Inserisci la data di pagamento per ogni riga.");
        setBulkSaving(false);
        return;
      }
    }

    const seen = new Set<string>();
    for (const row of editable) {
      const key = `${row.memberId}:${row.fiscalYear}`;
      if (seen.has(key)) {
        setError("Rimuovi le righe duplicate (stesso associato e anno).");
        setBulkSaving(false);
        return;
      }
      seen.add(key);
    }

    const result = await upsertMemberAnnualQuotas(
      supabase,
      editable.map((row) => {
        const amount = amountByYear.get(row.fiscalYear) ?? null;
        return {
          memberId: row.memberId,
          fiscalYear: row.fiscalYear,
          paidAt: row.paidAt,
          amountPaidEur: amount,
          amountDueEur: amount,
        };
      }),
    );

    setBulkSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio massivo.");
      return;
    }

    setSuccess(
      `Salvate ${result.upsertedCount ?? editable.length} quote annuali.`,
    );
    setBulkRows([
      newBulkRow(defaultYear, toDateInputValue(new Date().toISOString())),
    ]);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <SettingsTabs
        tabs={[
          { id: "impostazioni", label: "Impostazioni quote" },
          { id: "registrazione", label: "Registrazione massive" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "impostazioni" ? (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-neutral-600">
                    Anno
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-600">
                    Importo
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-600">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {settings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-neutral-500"
                    >
                      Nessuna impostazione configurata.
                    </td>
                  </tr>
                ) : (
                  settings.map((setting) => (
                    <tr key={setting.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 text-neutral-900">
                        {setting.fiscalYear}
                      </td>
                      <td className="px-4 py-3 text-neutral-900">
                        {formatQuotaEuro(setting.amountEur)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEditSetting(setting)}
                            className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === setting.id}
                            onClick={() => void handleDeleteSetting(setting.id)}
                            className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === setting.id ? "…" : "Elimina"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleSettingSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Anno</FieldLabel>
                <input
                  type="number"
                  min={2000}
                  required
                  value={settingForm.fiscalYear}
                  onChange={(e) =>
                    updateSettingField(
                      "fiscalYear",
                      Number(e.target.value) || defaultYear,
                    )
                  }
                  className={settingsInputClass}
                />
              </label>
              <label className="block">
                <FieldLabel>Importo</FieldLabel>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={settingForm.amountEur}
                  onChange={(e) =>
                    updateSettingField(
                      "amountEur",
                      Number(e.target.value) || 0,
                    )
                  }
                  className={settingsInputClass}
                />
              </label>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={settingsSaving}
                className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
              >
                {settingsSaving
                  ? "Salvataggio…"
                  : editingId
                    ? "Salva modifiche"
                    : "Aggiungi anno"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={cancelEditSetting}
                  className="rounded-lg border border-neutral-300 px-6 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Annulla
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : (
        <form onSubmit={handleBulkSave} className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-neutral-600">
                    Associato
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-neutral-600">
                    Anno
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-neutral-600">
                    Importo
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-neutral-600">
                    Data pagamento
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-neutral-600">
                    {" "}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {bulkRows.map((row) => {
                  const amount = amountByYear.get(row.fiscalYear);
                  return (
                    <tr
                      key={row.key}
                      className={row.locked ? "bg-neutral-50" : undefined}
                    >
                      <td className="px-3 py-2">
                        <select
                          value={row.memberId}
                          disabled={row.locked}
                          onChange={(e) =>
                            updateBulkRow(row.key, {
                              memberId: e.target.value,
                            })
                          }
                          className={settingsInputClass}
                          required={!row.locked}
                        >
                          <option value="">Seleziona associato…</option>
                          {sortedMembers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {memberLabel(member)}
                            </option>
                          ))}
                        </select>
                        {row.locked ? (
                          <p className="mt-1 text-xs text-green-700">
                            Già pagata
                            {row.paidAt
                              ? ` il ${formatQuotaDateItalian(row.paidAt)}`
                              : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.fiscalYear}
                          disabled={row.locked || settings.length === 0}
                          onChange={(e) =>
                            updateBulkRow(row.key, {
                              fiscalYear: Number(e.target.value),
                            })
                          }
                          className={settingsInputClass}
                        >
                          {settings.length === 0 ? (
                            <option value={defaultYear}>{defaultYear}</option>
                          ) : (
                            settings.map((setting) => (
                              <option
                                key={setting.id}
                                value={setting.fiscalYear}
                              >
                                {setting.fiscalYear}
                              </option>
                            ))
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          readOnly
                          value={
                            amount != null ? formatQuotaEuro(amount) : "—"
                          }
                          className={`${settingsInputClass} bg-neutral-50 text-neutral-600`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={row.paidAt}
                          disabled={row.locked}
                          required={!row.locked}
                          onChange={(e) =>
                            updateBulkRow(row.key, { paidAt: e.target.value })
                          }
                          className={settingsInputClass}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={bulkRows.length <= 1 || row.locked}
                          onClick={() => removeBulkRow(row.key)}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
                        >
                          Rimuovi
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={addBulkRow}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Aggiungi riga
            </button>
            <button
              type="submit"
              disabled={bulkSaving || settings.length === 0}
              className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {bulkSaving ? "Salvataggio…" : "Salva tutto"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
