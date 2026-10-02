"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  adminAdjustMemberCredits,
  deleteMember,
  updateMember,
  type AnnualQuotaSetting,
  type MemberAnnualQuota,
  type MemberCreditBalance,
  type MemberDetail,
  type MemberInput,
} from "@musicpro/database";

import { MemberQuotaSummary } from "@/components/admin/member-quota-summary";
import { ensureMemberAuthClient } from "@/lib/admin/ensure-member-auth-client";
import { createClient } from "@/lib/supabase/client";

interface MemberQuickEditProps {
  member: MemberDetail;
  creditAvailable: number;
  quotas: MemberAnnualQuota[];
  quotaSettings: AnnualQuotaSetting[];
  canDelete: boolean;
  onCancel: () => void;
  onDeleted: () => void;
  onOpenFull: () => void;
  onSaved: (member: MemberDetail, creditBalance?: MemberCreditBalance) => void;
}

function toInput(member: MemberDetail): MemberInput {
  const { id: _id, isEnrollmentDraft: _draft, draftExpiresAt: _exp, ...rest } =
    member;
  return rest;
}

export function MemberQuickEdit({
  member,
  creditAvailable,
  quotas,
  quotaSettings,
  canDelete,
  onCancel,
  onDeleted,
  onOpenFull,
  onSaved,
}: MemberQuickEditProps) {
  const router = useRouter();
  const supabase = createClient();

  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
  const [email, setEmail] = useState(member.email ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [credits, setCredits] = useState(String(creditAvailable));
  const [isActive, setIsActive] = useState(member.isActive);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Nome e cognome sono obbligatori.");
      setSaving(false);
      return;
    }

    const nextCredits = Number(credits);
    if (!Number.isFinite(nextCredits) || nextCredits < 0) {
      setError("I crediti devono essere un numero maggiore o uguale a zero.");
      setSaving(false);
      return;
    }

    const input: MemberInput = {
      ...toInput(member),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      isActive,
    };

    const result = await updateMember(supabase, member.id, input);
    if (!result.success) {
      setSaving(false);
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    const delta = nextCredits - creditAvailable;
    let nextBalance: MemberCreditBalance | undefined;
    if (delta !== 0) {
      const adjust = await adminAdjustMemberCredits(
        supabase,
        member.id,
        delta,
        "Rettifica da modifica rapida",
      );
      if (!adjust.success) {
        setSaving(false);
        setError(
          adjust.errorMessage ??
            "Anagrafica salvata, ma i crediti non sono stati aggiornati.",
        );
        onSaved({ ...member, ...input });
        router.refresh();
        return;
      }
      nextBalance = adjust.balance;
    }

    const auth = await ensureMemberAuthClient({
      memberId: member.id,
      email: input.email,
    });

    setSaving(false);
    setSuccess("Associato aggiornato.");
    if (!auth.ok && auth.warning) {
      setError(auth.warning);
    }
    onSaved({ ...member, ...input }, nextBalance);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const result = await deleteMember(supabase, member.id);
    setDeleting(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare l'associato.");
      setShowDeleteConfirm(false);
      return;
    }

    onDeleted();
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3 sm:space-y-3 sm:px-5 sm:py-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 sm:text-sm">
            {success}
          </p>
        ) : null}

        {member.isEnrollmentDraft ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">
            Bozza anagrafica — scade il{" "}
            {member.draftExpiresAt
              ? new Date(member.draftExpiresAt).toLocaleDateString("it-IT", {
                  timeZone: "Europe/Rome",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : "—"}{" "}
            (30g)
          </p>
        ) : null}

        <QuickField label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
          />
          <p className="mt-0.5 text-[11px] text-neutral-500 sm:text-xs">
            L&apos;accesso usa questo indirizzo email.
          </p>
        </QuickField>

        <div className="grid grid-cols-2 gap-2">
          <QuickField label="Nome *">
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
              autoComplete="given-name"
            />
          </QuickField>
          <QuickField label="Cognome *">
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
              autoComplete="family-name"
            />
          </QuickField>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <QuickField label="Cellulare">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              autoComplete="tel"
            />
          </QuickField>
          <QuickField label="Crediti sala">
            <input
              type="number"
              min={0}
              step={1}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              className={`${inputClass} sm:w-24`}
            />
          </QuickField>
        </div>
        <p className="-mt-1 text-[11px] text-neutral-500 sm:text-xs">
          Disponibili ora: {creditAvailable}. La differenza è una rettifica.
        </p>

        <MemberQuotaSummary
          quotas={quotas}
          quotaSettings={quotaSettings}
          enrolledAt={member.enrolledAt}
          onManage={onOpenFull}
        />

        <fieldset>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <legend className="sr-only">Stato</legend>
            <span className="text-xs text-neutral-600 sm:text-sm">Stato</span>
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="member-status"
                checked={isActive}
                onChange={() => setIsActive(true)}
              />
              Attivo
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="member-status"
                checked={!isActive}
                onChange={() => setIsActive(false)}
              />
              Bloccato
            </label>
          </div>
        </fieldset>
      </div>

      <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <button
          type="button"
          onClick={onOpenFull}
          className="mb-2 w-full text-center text-xs font-medium text-[var(--brand)] hover:underline sm:mb-3 sm:w-auto sm:text-left sm:text-sm"
        >
          Anagrafica completa
        </button>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="submit"
            disabled={saving}
            className="order-1 w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50 sm:order-3 sm:w-auto sm:py-2"
          >
            {saving ? "Salvataggio…" : "Aggiorna associato"}
          </button>
          <div className="order-2 grid grid-cols-2 gap-2 sm:order-1 sm:flex sm:gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:px-4"
            >
              Chiudi
            </button>
            {canDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 sm:px-4"
              >
                Elimina
              </button>
            ) : (
              <span className="hidden sm:block" aria-hidden />
            )}
          </div>
        </div>
      </div>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-xl bg-white p-4 shadow-lg sm:rounded-xl sm:p-6">
            <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">
              Conferma eliminazione
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Eliminare definitivamente{" "}
              <strong>
                {firstName} {lastName}
              </strong>
              ? Questa azione non può essere annullata.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium sm:py-2"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 sm:py-2"
              >
                {deleting ? "Eliminazione…" : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:rounded-lg sm:px-3 sm:py-2";

function QuickField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="mb-0.5 block text-xs text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
