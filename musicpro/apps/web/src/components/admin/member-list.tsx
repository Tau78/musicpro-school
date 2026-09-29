"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import {
  buildQuotaDunningMessage,
  recordMemberQuotaDunning,
  type MemberSummary,
} from "@musicpro/database";
import type { MemberRoleValue } from "@musicpro/shared";

import { BulkMessageModal } from "@/components/admin/bulk-message-modal";
import { MemberDetailDialog } from "@/components/admin/member-detail-dialog";
import { createClient } from "@/lib/supabase/client";

export interface MemberListProps {
  members: MemberSummary[];
  canAdd: boolean;
  compact?: boolean;
  creditBalances?: Record<string, number | null>;
  docenteIds?: string[];
  unpaidQuotaMemberIds?: string[];
  unpaidQuotaYear?: number;
  unpaidQuotaAmountEur?: number | null;
  canDelete: boolean;
  currentStaffMemberId: string;
  currentStaffRoles: MemberRoleValue[];
}

export function MemberList({
  members,
  canAdd,
  compact = false,
  creditBalances,
  docenteIds,
  unpaidQuotaMemberIds,
  unpaidQuotaYear,
  unpaidQuotaAmountEur = null,
  canDelete,
  currentStaffMemberId,
  currentStaffRoles,
}: MemberListProps) {
  const [search, setSearch] = useState("");
  const [docentiOnly, setDocentiOnly] = useState(false);
  const [bozzeOnly, setBozzeOnly] = useState(false);
  const [quotaUnpaidOnly, setQuotaUnpaidOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messageOpen, setMessageOpen] = useState(false);
  const [quotaDunningDraft, setQuotaDunningDraft] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  const docenteIdSet = useMemo(
    () => new Set(docenteIds ?? []),
    [docenteIds],
  );

  const unpaidQuotaIdSet = useMemo(
    () => new Set(unpaidQuotaMemberIds ?? []),
    [unpaidQuotaMemberIds],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return members.filter((member) => {
      if (docentiOnly && !docenteIdSet.has(member.id)) {
        return false;
      }
      if (bozzeOnly && !member.isEnrollmentDraft) {
        return false;
      }
      if (quotaUnpaidOnly && !unpaidQuotaIdSet.has(member.id)) {
        return false;
      }
      if (!term) return true;
      return (
        member.firstName.toLowerCase().includes(term) ||
        member.lastName.toLowerCase().includes(term)
      );
    });
  }, [
    members,
    search,
    docentiOnly,
    bozzeOnly,
    quotaUnpaidOnly,
    docenteIdSet,
    unpaidQuotaIdSet,
  ]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)),
    [members, selectedIds],
  );

  const openMember = openMemberId
    ? members.find((m) => m.id === openMemberId) ?? null
    : null;

  const closeMember = useCallback(() => setOpenMemberId(null), []);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const m of filtered) next.delete(m.id);
      } else {
        for (const m of filtered) next.add(m.id);
      }
      return next;
    });
  }

  function openQuotaDunningBulk() {
    const year = unpaidQuotaYear;
    if (year == null || unpaidQuotaIdSet.size === 0) return;
    setQuotaUnpaidOnly(true);
    setSelectedIds(new Set(unpaidQuotaIdSet));
    const draft = buildQuotaDunningMessage({
      firstName: "{{nome}}",
      fiscalYear: year,
      amountEur: unpaidQuotaAmountEur,
    });
    setQuotaDunningDraft(draft);
    setMessageOpen(true);
  }

  async function handleMessagesSent() {
    const year = unpaidQuotaYear;
    if (quotaDunningDraft && year != null && selectedIds.size > 0) {
      const supabase = createClient();
      await Promise.all(
        [...selectedIds].map((memberId) =>
          recordMemberQuotaDunning(supabase, {
            memberId,
            fiscalYear: year,
            amountDueEur: unpaidQuotaAmountEur,
          }).catch(() => ({ success: false })),
        ),
      );
    }
    setSelectedIds(new Set());
    setQuotaDunningDraft(null);
  }

  const filterPillClass = (active: boolean, tone: "brand" | "amber" = "brand") =>
    active
      ? tone === "amber"
        ? "border-amber-500 bg-amber-50 text-amber-800"
        : "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
      : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50";

  return (
    <div>
      <div className={compact ? "space-y-2" : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca nome o cognome…"
          className={`w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] ${
            compact ? "" : "sm:max-w-sm"
          }`}
        />

        <div
          className={`flex items-center gap-1.5 ${
            compact
              ? "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "flex-wrap"
          }`}
        >
          <button
            type="button"
            onClick={() => setDocentiOnly((prev) => !prev)}
            aria-pressed={docentiOnly}
            className={`inline-flex shrink-0 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium touch-manipulation sm:px-3 sm:py-1.5 sm:text-sm ${filterPillClass(docentiOnly)}`}
          >
            Docenti
          </button>
          <button
            type="button"
            onClick={() => setBozzeOnly((prev) => !prev)}
            aria-pressed={bozzeOnly}
            className={`inline-flex shrink-0 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium touch-manipulation sm:px-3 sm:py-1.5 sm:text-sm ${filterPillClass(bozzeOnly, "amber")}`}
          >
            Bozze
          </button>
          <button
            type="button"
            onClick={() => setQuotaUnpaidOnly((prev) => !prev)}
            aria-pressed={quotaUnpaidOnly}
            className={`inline-flex shrink-0 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium touch-manipulation sm:px-3 sm:py-1.5 sm:text-sm ${filterPillClass(quotaUnpaidOnly, "amber")}`}
          >
            Quota {unpaidQuotaYear ?? ""}
          </button>
          {unpaidQuotaIdSet.size > 0 && unpaidQuotaYear != null ? (
            <button
              type="button"
              onClick={openQuotaDunningBulk}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 touch-manipulation hover:bg-amber-100 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              Sollecita ({unpaidQuotaIdSet.size})
            </button>
          ) : null}
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuotaDunningDraft(null);
                setMessageOpen(true);
              }}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--brand)] px-2.5 py-1 text-xs font-medium text-[var(--brand)] touch-manipulation hover:bg-[var(--brand)]/5 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              Messaggio ({selectedIds.size})
            </button>
          ) : null}
          {!compact && canAdd ? (
            <Link
              href="/admin/associati/nuovo"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Nuovo associato
            </Link>
          ) : null}
        </div>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "mt-2" : "mt-3"}`}>
        <p className="text-sm text-neutral-500">
          {filtered.length} associat{filtered.length === 1 ? "o" : "i"}
          {selectedIds.size > 0
            ? ` · ${selectedIds.size} selezionat${selectedIds.size === 1 ? "o" : "i"}`
            : ""}
        </p>
        {filtered.length > 0 ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAllFiltered}
              className="h-4 w-4 rounded border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)]"
            />
            Seleziona tutti
          </label>
        ) : null}
      </div>

      <ul
        className={`divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white ${
          compact ? "mt-2" : "mt-4"
        }`}
      >
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessun associato trovato.
          </li>
        ) : (
          filtered.map((member) => (
            <li key={member.id} className="flex items-stretch">
              <label className="flex shrink-0 items-center px-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(member.id)}
                  onChange={() => toggleOne(member.id)}
                  className="h-4 w-4 rounded border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)]"
                  aria-label={`Seleziona ${member.lastName} ${member.firstName}`}
                />
              </label>
              <Link
                href={`/admin/associati/${member.id}`}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  setOpenMemberId(member.id);
                }}
                className={`flex min-w-0 flex-1 items-center transition-colors hover:bg-neutral-50 ${
                  compact ? "gap-2.5 py-2.5 pr-3" : "gap-4 py-3 pr-4"
                }`}
              >
                <div
                  className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 font-semibold text-[var(--brand)] ${
                    compact ? "h-9 w-9 text-xs" : "h-10 w-10 text-sm"
                  }`}
                >
                  {member.firstName.charAt(0)}
                  {member.lastName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">
                    {member.lastName} {member.firstName}
                  </p>
                  <p className="truncate text-sm text-neutral-500">
                    {member.email ?? member.phone ?? "—"}
                  </p>
                </div>
                {member.isEnrollmentDraft ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Bozza
                  </span>
                ) : null}
                {unpaidQuotaIdSet.has(member.id) ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Quota {unpaidQuotaYear ?? ""}
                  </span>
                ) : null}
                {docenteIdSet.has(member.id) ? (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    Docente
                  </span>
                ) : null}
                {member.memberNumber ? (
                  <span className="shrink-0 text-xs text-neutral-400">
                    n. {member.memberNumber}
                  </span>
                ) : null}
                {creditBalances && creditBalances[member.id] != null ? (
                  <span
                    className="shrink-0 rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--brand)]"
                    title="Crediti disponibili"
                  >
                    {creditBalances[member.id]} cr.
                  </span>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>

      <BulkMessageModal
        open={messageOpen}
        members={selectedMembers}
        initialSubject={quotaDunningDraft?.subject}
        initialBody={quotaDunningDraft?.body}
        campaignName={
          quotaDunningDraft && unpaidQuotaYear != null
            ? `Sollecito quota ${unpaidQuotaYear}`
            : undefined
        }
        onClose={() => {
          setMessageOpen(false);
          setQuotaDunningDraft(null);
        }}
        onSent={() => {
          void handleMessagesSent();
        }}
      />

      {openMember ? (
        <MemberDetailDialog
          memberId={openMember.id}
          previewName={`${openMember.lastName} ${openMember.firstName}`}
          canDelete={canDelete}
          currentStaffMemberId={currentStaffMemberId}
          currentStaffRoles={currentStaffRoles}
          onClose={closeMember}
        />
      ) : null}
    </div>
  );
}
