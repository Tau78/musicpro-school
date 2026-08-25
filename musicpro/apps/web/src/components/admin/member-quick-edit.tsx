"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  adminAdjustMemberCredits,
  deleteMember,
  updateMember,
  type MemberCreditBalance,
  type MemberDetail,
  type MemberInput,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface MemberQuickEditProps {
  member: MemberDetail;
  creditAvailable: number;
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

    setSaving(false);
    setSuccess("Associato aggiornato.");
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
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
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

      {member.isEnrollmentDraft ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
        />
        <p className="mt-1 text-xs text-neutral-500">
          L&apos;accesso usa questo indirizzo email.
        </p>
      </QuickField>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuickField label="Nome *">
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
          />
        </QuickField>
        <QuickField label="Cognome *">
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
          />
        </QuickField>
      </div>

      <QuickField label="Cellulare">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </QuickField>

      <QuickField label="Crediti sala">
        <input
          type="number"
          min={0}
          step={1}
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          className={`${inputClass} max-w-[8rem]`}
        />
        <p className="mt-1 text-xs text-neutral-500">
          Disponibili ora: {creditAvailable}. La differenza viene registrata
          come rettifica.
        </p>
      </QuickField>

      <fieldset>
        <legend className="mb-2 text-sm text-neutral-600">Stato</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="member-status"
              checked={isActive}
              onChange={() => setIsActive(true)}
            />
            Attivo
          </label>
          <label className="inline-flex items-center gap-2">
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

      <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onOpenFull}
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          Anagrafica completa
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Chiudi
          </button>
          {canDelete ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Elimina
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Aggiorna associato"}
          </button>
        </div>
      </div>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-neutral-900">
              Conferma eliminazione
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Eliminare definitivamente{" "}
              <strong>
                {firstName} {lastName}
              </strong>
              ? Questa azione non può essere annullata.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

function QuickField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
