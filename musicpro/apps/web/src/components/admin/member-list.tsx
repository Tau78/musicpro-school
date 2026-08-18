"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { MemberSummary } from "@musicpro/database";

import { BulkMessageModal } from "@/components/admin/bulk-message-modal";

interface MemberListProps {
  members: MemberSummary[];
  canAdd: boolean;
  creditBalances?: Record<string, number | null>;
  docenteIds?: string[];
}

export function MemberList({
  members,
  canAdd,
  creditBalances,
  docenteIds,
}: MemberListProps) {
  const [search, setSearch] = useState("");
  const [docentiOnly, setDocentiOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messageOpen, setMessageOpen] = useState(false);

  const docenteIdSet = useMemo(
    () => new Set(docenteIds ?? []),
    [docenteIds],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return members.filter((member) => {
      if (docentiOnly && !docenteIdSet.has(member.id)) {
        return false;
      }
      if (!term) return true;
      return (
        member.firstName.toLowerCase().includes(term) ||
        member.lastName.toLowerCase().includes(term)
      );
    });
  }, [members, search, docentiOnly, docenteIdSet]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)),
    [members, selectedIds],
  );

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

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-wrap items-center gap-2 sm:max-w-xl">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome o cognome…"
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:max-w-sm"
          />
          <button
            type="button"
            onClick={() => setDocentiOnly((prev) => !prev)}
            aria-pressed={docentiOnly}
            className={
              docentiOnly
                ? "inline-flex items-center justify-center rounded-full border border-[var(--brand)] bg-[var(--brand)]/10 px-3 py-1.5 text-sm font-medium text-[var(--brand)]"
                : "inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            }
          >
            Docenti
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => setMessageOpen(true)}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
            >
              Invia messaggio ({selectedIds.size})
            </button>
          ) : null}
          {canAdd ? (
            <Link
              href="/admin/associati/nuovo"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Nuovo associato
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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

      <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
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
                className="flex min-w-0 flex-1 items-center gap-4 py-3 pr-4 transition-colors hover:bg-neutral-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-sm font-semibold text-[var(--brand)]">
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
        onClose={() => setMessageOpen(false)}
        onSent={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
