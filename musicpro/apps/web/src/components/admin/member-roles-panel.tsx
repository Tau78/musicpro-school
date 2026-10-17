"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getTeacherProfile,
  listMemberIdsWithRole,
  setMemberHasRole,
  upsertTeacherProfile,
} from "@musicpro/database";
import {
  MEMBER_ROLE_LABELS,
  MemberRole,
  type MemberRoleValue,
} from "@musicpro/shared";

import { createClient } from "@/lib/supabase/client";

const ASSIGNABLE_ROLES: MemberRoleValue[] = [
  MemberRole.Admin,
  MemberRole.Segreteria,
  MemberRole.Docente,
  MemberRole.Collaboratore,
];

interface MemberRolesPanelProps {
  memberId: string;
  initialRoles: MemberRoleValue[];
  currentStaffMemberId: string;
  currentStaffRoles: MemberRoleValue[];
  /** Riga di checkbox, senza riquadro. */
  variant?: "card" | "flags";
  onRolesChange?: (roles: MemberRoleValue[]) => void;
}

function canToggleRole(
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

export function MemberRolesPanel({
  memberId,
  initialRoles,
  currentStaffMemberId,
  currentStaffRoles,
  variant = "card",
  onRolesChange,
}: MemberRolesPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [roles, setRoles] = useState<Set<MemberRoleValue>>(
    () => new Set(initialRoles),
  );
  const [bookingEmailCc, setBookingEmailCc] = useState(false);
  const [busyRole, setBusyRole] = useState<MemberRoleValue | null>(null);
  const [busyCc, setBusyCc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = createClient();
    void client
      .from("members")
      .select("booking_email_cc")
      .eq("id", memberId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setBookingEmailCc(Boolean(data?.booking_email_cc));
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  async function handleToggle(role: MemberRoleValue, checked: boolean) {
    const label = MEMBER_ROLE_LABELS[role as MemberRole] ?? role;

    if (!canToggleRole(role, currentStaffRoles)) {
      setError(`Non puoi modificare il ruolo ${label}.`);
      return;
    }

    if (
      role === MemberRole.Admin &&
      !checked &&
      memberId === currentStaffMemberId
    ) {
      setError("Non puoi togliere a te stesso il ruolo Amministratore.");
      return;
    }

    setBusyRole(role);
    setError(null);
    setSuccess(null);

    if (role === MemberRole.Admin && !checked) {
      try {
        const adminIds = await listMemberIdsWithRole(
          supabase,
          MemberRole.Admin,
        );
        if (adminIds.length <= 1) {
          setBusyRole(null);
          setError("Deve restare almeno un amministratore.");
          return;
        }
      } catch {
        setBusyRole(null);
        setError("Impossibile verificare gli amministratori. Riprova.");
        return;
      }
    }

    const nextRoles = new Set(roles);
    if (checked) nextRoles.add(role);
    else nextRoles.delete(role);
    setRoles(nextRoles);

    const roleResult = await setMemberHasRole(
      supabase,
      memberId,
      role,
      checked,
      checked ? currentStaffMemberId : null,
    );

    if (!roleResult.success) {
      setRoles((prev) => {
        const next = new Set(prev);
        if (checked) next.delete(role);
        else next.add(role);
        return next;
      });
      setBusyRole(null);
      setError(
        roleResult.errorMessage ?? `Impossibile aggiornare il ruolo ${label}.`,
      );
      return;
    }

    if (checked && role === MemberRole.Docente) {
      let hasProfile = false;
      try {
        hasProfile = (await getTeacherProfile(supabase, memberId)) != null;
      } catch {
        hasProfile = false;
      }

      if (!hasProfile) {
        const profileResult = await upsertTeacherProfile(supabase, memberId, {
          canCreateCourses: false,
          canReschedule: true,
          canCloseCourses: false,
          paymentVisibility: "hidden",
        });

        if (!profileResult.success) {
          setBusyRole(null);
          setError(
            profileResult.errorMessage ??
              "Ruolo assegnato, ma il profilo docente non è stato creato.",
          );
          router.refresh();
          return;
        }
      }
    }

    if (!checked && role === MemberRole.Collaboratore && bookingEmailCc) {
      setBookingEmailCc(false);
      const { error: ccError } = await supabase
        .from("members")
        .update({ booking_email_cc: false })
        .eq("id", memberId);
      if (ccError) {
        setBookingEmailCc(true);
        setBusyRole(null);
        setError("Ruolo rimosso, ma Email prenotazioni non è stato spento.");
        onRolesChange?.([...nextRoles]);
        router.refresh();
        return;
      }
    }

    setBusyRole(null);
    if (variant === "card") {
      setSuccess(
        checked ? `Ruolo ${label} assegnato.` : `Ruolo ${label} rimosso.`,
      );
    }
    onRolesChange?.([...nextRoles]);
    router.refresh();
  }

  async function handleBookingEmailCc(checked: boolean) {
    if (!roles.has(MemberRole.Collaboratore)) return;
    if (!canToggleRole(MemberRole.Collaboratore, currentStaffRoles)) {
      setError("Non puoi modificare Email prenotazioni.");
      return;
    }

    setBusyCc(true);
    setError(null);
    setSuccess(null);
    setBookingEmailCc(checked);

    const { error: updateError } = await supabase
      .from("members")
      .update({ booking_email_cc: checked })
      .eq("id", memberId);

    setBusyCc(false);
    if (updateError) {
      setBookingEmailCc(!checked);
      setError("Impossibile aggiornare Email prenotazioni.");
      return;
    }
    router.refresh();
  }

  const flags = ASSIGNABLE_ROLES.map((role) => {
    const label = MEMBER_ROLE_LABELS[role as MemberRole] ?? role;
    const allowed = canToggleRole(role, currentStaffRoles);
    const lockedSelfAdmin =
      role === MemberRole.Admin && memberId === currentStaffMemberId;
    const collaboratoreOn = roles.has(MemberRole.Collaboratore);
    return (
      <span key={role} className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={roles.has(role)}
            disabled={busyRole != null || busyCc || !allowed || lockedSelfAdmin}
            onChange={(e) => void handleToggle(role, e.target.checked)}
            className="rounded border-neutral-300"
          />
          {label}
        </label>
        {role === MemberRole.Collaboratore ? (
          <label
            className={`inline-flex items-center gap-1.5 text-sm ${
              collaboratoreOn ? "" : "text-neutral-400"
            }`}
          >
            <input
              type="checkbox"
              checked={collaboratoreOn && bookingEmailCc}
              disabled={
                busyRole != null || busyCc || !allowed || !collaboratoreOn
              }
              onChange={(e) => void handleBookingEmailCc(e.target.checked)}
              className="rounded border-neutral-300"
              aria-label="Email prenotazioni"
            />
            Email prenotazioni
          </label>
        ) : null}
      </span>
    );
  });

  if (variant === "flags") {
    return (
      <div>
        {error ? (
          <p className="mb-1 text-xs text-red-700">{error}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-neutral-600">Ruoli</span>
          {flags}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Ruoli
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">{flags}</div>
      </fieldset>
    </div>
  );
}
