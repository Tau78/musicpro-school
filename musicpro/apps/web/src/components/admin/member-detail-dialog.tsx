"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getMemberById,
  getMemberCreditBalance,
  getMemberRoles,
  listMemberAnnualQuotas,
  listMemberCreditTransactions,
  type CreditTransaction,
  type MemberAnnualQuota,
  type MemberCreditBalance,
  type MemberDetail,
} from "@musicpro/database";
import type { MemberRoleValue } from "@musicpro/shared";

import { MemberCreditsPanel } from "@/components/admin/member-credits-panel";
import { MemberForm } from "@/components/admin/member-form";
import { MemberRolesPanel } from "@/components/admin/member-roles-panel";
import { createClient } from "@/lib/supabase/client";

interface MemberDetailDialogProps {
  memberId: string;
  previewName: string;
  canDelete: boolean;
  currentStaffMemberId: string;
  currentStaffRoles: MemberRoleValue[];
  onClose: () => void;
}

type DialogData = {
  member: MemberDetail;
  quotas: MemberAnnualQuota[];
  roles: MemberRoleValue[];
  creditBalance: MemberCreditBalance;
  creditTransactions: CreditTransaction[];
};

export function MemberDetailDialog({
  memberId,
  previewName,
  canDelete,
  currentStaffMemberId,
  currentStaffRoles,
  onClose,
}: MemberDetailDialogProps) {
  const [data, setData] = useState<DialogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    const supabase = createClient();

    void (async () => {
      try {
        const [member, quotas, roles, credits] = await Promise.all([
          getMemberById(supabase, memberId),
          listMemberAnnualQuotas(supabase, { memberId }),
          getMemberRoles(supabase, memberId),
          Promise.all([
            getMemberCreditBalance(supabase, memberId),
            listMemberCreditTransactions(supabase, memberId),
          ]).catch(
            (): [MemberCreditBalance, CreditTransaction[]] => [
              { available: 0, held: 0, total: 0 },
              [],
            ],
          ),
        ]);

        if (cancelled) return;

        if (!member) {
          setError("Associato non trovato.");
          setLoading(false);
          return;
        }

        setData({
          member,
          quotas,
          roles,
          creditBalance: credits[0],
          creditTransactions: credits[1],
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Impossibile caricare l'associato.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const title = data
    ? `${data.member.lastName} ${data.member.firstName}`
    : previewName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-detail-title"
        className="flex max-h-[100vh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="member-detail-title"
              className="truncate text-lg font-semibold text-[var(--brand)]"
            >
              {title}
            </h2>
            <Link
              href={`/admin/associati/${memberId}`}
              className="mt-1 inline-block text-xs font-medium text-neutral-500 hover:text-[var(--brand)] hover:underline"
            >
              Apri scheda completa
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Chiudi
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              Caricamento dati…
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {data ? (
            <>
              {data.member.isEnrollmentDraft ? (
                <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Bozza anagrafica — scade il{" "}
                  {data.member.draftExpiresAt
                    ? new Date(data.member.draftExpiresAt).toLocaleDateString(
                        "it-IT",
                        {
                          timeZone: "Europe/Rome",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        },
                      )
                    : "—"}{" "}
                  (30g)
                </p>
              ) : null}

              <MemberRolesPanel
                key={`${data.member.id}-roles`}
                memberId={data.member.id}
                initialRoles={data.roles}
                currentStaffMemberId={currentStaffMemberId}
                currentStaffRoles={currentStaffRoles}
              />

              <MemberForm
                key={data.member.id}
                member={data.member}
                canDelete={canDelete}
                quotas={data.quotas}
                onCancel={onClose}
                onDeleted={onClose}
              />

              <MemberCreditsPanel
                key={`${data.member.id}-credits`}
                memberId={data.member.id}
                initialBalance={data.creditBalance}
                initialTransactions={data.creditTransactions}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
