"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
];

interface MemberRolesPanelProps {
  memberId: string;
  initialRoles: MemberRoleValue[];
  currentStaffMemberId: string;
  currentStaffRoles: MemberRoleValue[];
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
}: MemberRolesPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [roles, setRoles] = useState<Set<MemberRoleValue>>(
    () => new Set(initialRoles),
  );
  const [busyRole, setBusyRole] = useState<MemberRoleValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

    setRoles((prev) => {
      const next = new Set(prev);
      if (checked) next.add(role);
      else next.delete(role);
      return next;
    });

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
          canReschedule: false,
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

    setBusyRole(null);
    setSuccess(
      checked ? `Ruolo ${label} assegnato.` : `Ruolo ${label} rimosso.`,
    );
    router.refresh();
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
        <div className="grid gap-3 sm:grid-cols-3">
          {ASSIGNABLE_ROLES.map((role) => {
            const label = MEMBER_ROLE_LABELS[role as MemberRole] ?? role;
            const allowed = canToggleRole(role, currentStaffRoles);
            const lockedSelfAdmin =
              role === MemberRole.Admin && memberId === currentStaffMemberId;
            return (
              <label key={role} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roles.has(role)}
                  disabled={
                    busyRole != null || !allowed || lockedSelfAdmin
                  }
                  onChange={(e) => void handleToggle(role, e.target.checked)}
                  className="rounded border-neutral-300"
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
