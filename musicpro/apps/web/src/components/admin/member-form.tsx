"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import {
  type MemberAnnualQuota,
  type MemberDetail,
  type MemberInput,
  createMember,
  currentFiscalYear,
  deleteMember,
  formatQuotaDateItalian,
  formatQuotaEuro,
  setMemberHasRole,
  updateMember,
  upsertTeacherProfile,
} from "@musicpro/database";
import {
  MEMBER_ROLE_LABELS,
  MemberRole,
  type MemberRoleValue,
} from "@musicpro/shared";

import { createClient } from "@/lib/supabase/client";

interface MemberFormProps {
  member?: MemberDetail;
  defaultMemberNumber?: number;
  canDelete?: boolean;
  quotas?: MemberAnnualQuota[];
  currentStaffMemberId?: string;
  currentStaffRoles?: MemberRoleValue[];
  initialIsDocente?: boolean;
}

const CREATE_ASSIGNABLE_ROLES: MemberRoleValue[] = [
  MemberRole.Admin,
  MemberRole.Segreteria,
  MemberRole.Docente,
];

function canAssignRoleOnCreate(
  role: MemberRoleValue,
  staffRoles: MemberRoleValue[],
): boolean {
  if (role === MemberRole.Admin) {
    return staffRoles.includes(MemberRole.Admin);
  }
  return (
    staffRoles.includes(MemberRole.Admin) ||
    staffRoles.includes(MemberRole.Segreteria)
  );
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyMemberInput(defaultMemberNumber?: number): MemberInput {
  return {
    memberNumber: defaultMemberNumber ?? null,
    enrolledAt: null,
    firstName: "",
    lastName: "",
    birthPlace: null,
    birthProvince: null,
    birthDate: null,
    addressStreet: null,
    addressPostalCode: null,
    addressCity: null,
    addressProvince: null,
    taxCode: null,
    phone: null,
    email: null,
    legacyTutorMemberNumber: null,
    legacyTutorFullName: null,
    manualTutorFirstName: null,
    manualTutorLastName: null,
    manualTutorPhone: null,
    manualTutorEmail: null,
    manualTutorTaxCode: null,
    telegramChatId: null,
    gdprConsent: false,
    gdprConsentAt: null,
    photoConsent: false,
    photoConsentAt: null,
    isActive: true,
    membershipCardPickedUpAt: null,
    gadgetsPickedUpAt: null,
  };
}

function memberToInput(member: MemberDetail): MemberInput {
  const { id: _id, ...rest } = member;
  return rest;
}

export function MemberForm({
  member,
  defaultMemberNumber,
  canDelete = false,
  quotas = [],
  currentStaffMemberId,
  currentStaffRoles = [],
  initialIsDocente = false,
}: MemberFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = Boolean(member);

  const [form, setForm] = useState<MemberInput>(
    member ? memberToInput(member) : emptyMemberInput(defaultMemberNumber),
  );
  const [createRoles, setCreateRoles] = useState<Set<MemberRoleValue>>(
    () => new Set(initialIsDocente ? [MemberRole.Docente] : []),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof MemberInput>(
    key: K,
    value: MemberInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Nome e cognome sono obbligatori.");
      setSaving(false);
      return;
    }

    const result = isEdit
      ? await updateMember(supabase, member!.id, form)
      : await createMember(supabase, form);

    if (!result.success) {
      setSaving(false);
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    if (!isEdit && result.id) {
      const rolesToGrant = CREATE_ASSIGNABLE_ROLES.filter(
        (role) =>
          createRoles.has(role) &&
          canAssignRoleOnCreate(role, currentStaffRoles),
      );

      if (rolesToGrant.length > 0 && currentStaffMemberId) {
        for (const role of rolesToGrant) {
          const roleResult = await setMemberHasRole(
            supabase,
            result.id,
            role,
            true,
            currentStaffMemberId,
          );

          if (!roleResult.success) {
            const label = MEMBER_ROLE_LABELS[role as MemberRole] ?? role;
            setSaving(false);
            setError(
              `Anagrafica salvata, ma non è stato possibile assegnare il ruolo ${label}. Puoi riprovare dalla scheda.`,
            );
            router.push(`/admin/associati/${result.id}`);
            router.refresh();
            return;
          }
        }

        if (rolesToGrant.includes(MemberRole.Docente)) {
          const profileResult = await upsertTeacherProfile(supabase, result.id, {
            canCreateCourses: false,
            canReschedule: false,
            canCloseCourses: false,
            paymentVisibility: "hidden",
          });

          if (!profileResult.success) {
            setSaving(false);
            setError(
              "Anagrafica e ruolo salvati, ma il profilo docente non è stato creato. Puoi riprovare dalla scheda.",
            );
            router.push(`/admin/associati/${result.id}`);
            router.refresh();
            return;
          }
        }
      }

      setSaving(false);
      setSuccess("Associato creato.");
      router.push(`/admin/associati/${result.id}`);
      router.refresh();
      return;
    }

    setSaving(false);
    setSuccess("Associato aggiornato.");
    router.refresh();
  }

  async function handleDelete() {
    if (!member) return;

    setDeleting(true);
    setError(null);

    const result = await deleteMember(supabase, member.id);
    setDeleting(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare l'associato.");
      setShowDeleteConfirm(false);
      return;
    }

    router.push("/admin/associati");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Dati anagrafici
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Numero associato">
            <input
              type="number"
              value={form.memberNumber ?? ""}
              onChange={(e) =>
                updateField(
                  "memberNumber",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Data iscrizione">
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(form.enrolledAt)}
              onChange={(e) =>
                updateField(
                  "enrolledAt",
                  e.target.value ? new Date(e.target.value).toISOString() : null,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Nome *">
            <input
              required
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Cognome *">
            <input
              required
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Luogo di nascita">
            <input
              value={form.birthPlace ?? ""}
              onChange={(e) => updateField("birthPlace", e.target.value || null)}
              className={inputClass}
            />
          </Field>
          <Field label="Provincia nascita">
            <input
              value={form.birthProvince ?? ""}
              onChange={(e) =>
                updateField("birthProvince", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Data di nascita">
            <input
              type="date"
              value={toDateInputValue(form.birthDate)}
              onChange={(e) =>
                updateField("birthDate", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Codice fiscale">
            <input
              value={form.taxCode ?? ""}
              onChange={(e) => updateField("taxCode", e.target.value || null)}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Indirizzo
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Indirizzo" className="sm:col-span-2">
            <input
              value={form.addressStreet ?? ""}
              onChange={(e) =>
                updateField("addressStreet", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="CAP">
            <input
              value={form.addressPostalCode ?? ""}
              onChange={(e) =>
                updateField("addressPostalCode", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Città">
            <input
              value={form.addressCity ?? ""}
              onChange={(e) =>
                updateField("addressCity", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Provincia">
            <input
              value={form.addressProvince ?? ""}
              onChange={(e) =>
                updateField("addressProvince", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Contatti
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefono">
            <input
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => updateField("phone", e.target.value || null)}
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => updateField("email", e.target.value || null)}
              className={inputClass}
            />
          </Field>
          <Field label="Telegram Chat ID">
            <input
              value={form.telegramChatId ?? ""}
              onChange={(e) =>
                updateField("telegramChatId", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Tutore
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="N. tutore (legacy)">
            <input
              type="number"
              value={form.legacyTutorMemberNumber ?? ""}
              onChange={(e) =>
                updateField(
                  "legacyTutorMemberNumber",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Nome completo tutore (legacy)">
            <input
              value={form.legacyTutorFullName ?? ""}
              onChange={(e) =>
                updateField("legacyTutorFullName", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Nome tutore manuale">
            <input
              value={form.manualTutorFirstName ?? ""}
              onChange={(e) =>
                updateField("manualTutorFirstName", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Cognome tutore manuale">
            <input
              value={form.manualTutorLastName ?? ""}
              onChange={(e) =>
                updateField("manualTutorLastName", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Cellulare tutore">
            <input
              value={form.manualTutorPhone ?? ""}
              onChange={(e) =>
                updateField("manualTutorPhone", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Email tutore">
            <input
              type="email"
              value={form.manualTutorEmail ?? ""}
              onChange={(e) =>
                updateField("manualTutorEmail", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <Field label="CF tutore">
            <input
              value={form.manualTutorTaxCode ?? ""}
              onChange={(e) =>
                updateField("manualTutorTaxCode", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
        </div>
        {/* TODO: gestione tutor_links normalizzati (Phase 2) */}
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Ritiri
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <PickupFlag
            label="Tessera ritirata"
            value={form.membershipCardPickedUpAt}
            onChange={(next) => updateField("membershipCardPickedUpAt", next)}
          />
          <PickupFlag
            label="Gadget ritirati"
            value={form.gadgetsPickedUpAt}
            onChange={(next) => updateField("gadgetsPickedUpAt", next)}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Altro
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.gdprConsent}
              onChange={(e) => updateField("gdprConsent", e.target.checked)}
              className="rounded border-neutral-300"
            />
            Consenso GDPR
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.photoConsent}
              onChange={(e) => updateField("photoConsent", e.target.checked)}
              className="rounded border-neutral-300"
            />
            Consenso foto/video
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => updateField("isActive", e.target.checked)}
              className="rounded border-neutral-300"
            />
            Associato attivo
          </label>
        </div>

        {isEdit ? (
          <div className="space-y-2 border-t border-neutral-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-neutral-800">
                Quote annuali
              </p>
              <Link
                href="/admin/quote"
                className="text-xs font-medium text-[var(--brand)] hover:underline"
              >
                Gestisci in Quote
              </Link>
            </div>
            {quotas.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nessuna quota registrata. Anno corrente ({currentFiscalYear()}):
                non pagata.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-neutral-700">
                {quotas.map((quota) => {
                  const paid = Boolean(quota.paidAt);
                  const amount =
                    quota.amountPaidEur ?? quota.amountDueEur ?? null;
                  return (
                    <li key={quota.id} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{quota.fiscalYear}</span>
                      <span
                        className={paid ? "text-green-700" : "text-amber-700"}
                      >
                        {paid ? "Pagata" : "Non pagata"}
                      </span>
                      {paid && quota.paidAt ? (
                        <span className="text-neutral-500">
                          il {formatQuotaDateItalian(quota.paidAt)}
                        </span>
                      ) : null}
                      {amount != null ? (
                        <span className="text-neutral-500">
                          ({formatQuotaEuro(amount)})
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </fieldset>

      {!isEdit ? (
        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Ruoli
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {CREATE_ASSIGNABLE_ROLES.map((role) => {
              const allowed = canAssignRoleOnCreate(role, currentStaffRoles);
              return (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createRoles.has(role)}
                    disabled={!allowed}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCreateRoles((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(role);
                        else next.delete(role);
                        return next;
                      });
                    }}
                    className="rounded border-neutral-300"
                  />
                  {MEMBER_ROLE_LABELS[role as MemberRole] ?? role}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Crea associato"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/associati")}
            className="rounded-lg border border-neutral-300 px-6 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Annulla
          </button>
        </div>

        {isEdit && canDelete ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-red-300 px-6 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Elimina
          </button>
        ) : null}
      </div>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-neutral-900">
              Conferma eliminazione
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Eliminare definitivamente{" "}
              <strong>
                {member?.firstName} {member?.lastName}
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

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function PickupFlag({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => {
            if (e.target.checked) {
              onChange(value ?? new Date().toISOString());
            } else {
              onChange(null);
            }
          }}
          className="rounded border-neutral-300"
        />
        {label}
      </label>
      {value ? (
        <p className="mt-1 text-xs text-neutral-500">
          Ritiro: {new Date(value).toLocaleDateString("it-IT")}
        </p>
      ) : null}
    </div>
  );
}
