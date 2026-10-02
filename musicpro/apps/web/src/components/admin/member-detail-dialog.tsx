"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getMemberById,
  getMemberCreditBalance,
  getMemberRoles,
  listAnnualQuotaSettings,
  listMemberAnnualQuotas,
  listMemberCreditTransactions,
  type AnnualQuotaSetting,
  type CreditTransaction,
  type MemberAnnualQuota,
  type MemberCreditBalance,
  type MemberDetail,
} from "@musicpro/database";
import type { MemberRoleValue } from "@musicpro/shared";

import { MemberCreditsPanel } from "@/components/admin/member-credits-panel";
import { MemberForm } from "@/components/admin/member-form";
import { MemberQuickEdit } from "@/components/admin/member-quick-edit";
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
  quotaSettings: AnnualQuotaSetting[];
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
  const [view, setView] = useState<"quick" | "full">("quick");

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
    setView("quick");

    const supabase = createClient();

    void (async () => {
      try {
        const [member, quotas, quotaSettings, roles, credits] =
          await Promise.all([
            getMemberById(supabase, memberId),
            listMemberAnnualQuotas(supabase, { memberId }),
            listAnnualQuotaSettings(supabase),
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
          quotaSettings,
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
        className={
          view === "quick"
            ? "flex max-h-[100dvh] w-full max-w-lg min-w-0 flex-col overflow-hidden bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl"
            : "flex max-h-[100dvh] w-full max-w-3xl min-w-0 flex-col overflow-hidden bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl"
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-neutral-200 px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <h2
              id="member-detail-title"
              className="truncate text-base font-semibold text-[var(--brand)] sm:text-lg"
            >
              {view === "quick" ? "Modifica associato" : title}
            </h2>
            {view === "full" ? (
              <button
                type="button"
                onClick={() => setView("quick")}
                className="mt-0.5 text-xs font-medium text-neutral-500 hover:text-[var(--brand)] hover:underline"
              >
                Torna alla modifica rapida
              </button>
            ) : (
              <p className="mt-0.5 truncate text-xs text-neutral-500 sm:text-sm">
                {title}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 sm:text-sm sm:font-normal"
          >
            <span className="sm:hidden" aria-hidden>
              ×
            </span>
            <span className="hidden sm:inline">Chiudi</span>
          </button>
        </div>

        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-500 sm:px-5">
            Caricamento dati…
          </p>
        ) : null}

        {error ? (
          <p className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-5">
            {error}
          </p>
        ) : null}

        {data && view === "quick" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <MemberQuickEdit
              key={`${data.member.id}-quick-${data.member.email}-${data.creditBalance.available}`}
              member={data.member}
              creditAvailable={data.creditBalance.available}
              quotas={data.quotas}
              quotaSettings={data.quotaSettings}
              canDelete={canDelete}
              onCancel={onClose}
              onDeleted={onClose}
              onOpenFull={() => setView("full")}
              onSaved={(member, creditBalance) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        member,
                        creditBalance: creditBalance ?? prev.creditBalance,
                      }
                    : prev,
                )
              }
            />
          </div>
        ) : null}

        {data && view === "full" ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
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
                quotaSettings={data.quotaSettings}
                onCancel={() => setView("quick")}
                onDeleted={onClose}
              />

              <MemberCreditsPanel
                key={`${data.member.id}-credits`}
                memberId={data.member.id}
                initialBalance={data.creditBalance}
                initialTransactions={data.creditTransactions}
              />

              <p className="mt-8 text-center text-sm">
                <Link
                  href={`/admin/associati/${memberId}`}
                  className="font-medium text-[var(--brand)] hover:underline"
                >
                  Apri pagina (didattica e disponibilità)
                </Link>
              </p>
            </>
          </div>
        ) : null}
      </div>
    </div>
  );
}
