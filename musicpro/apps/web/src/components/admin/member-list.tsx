"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { MemberSummary } from "@musicpro/database";

interface MemberListProps {
  members: MemberSummary[];
  canAdd: boolean;
}

export function MemberList({ members, canAdd }: MemberListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;

    return members.filter(
      (member) =>
        member.firstName.toLowerCase().includes(term) ||
        member.lastName.toLowerCase().includes(term),
    );
  }, [members, search]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome o cognome…"
          className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:max-w-sm"
        />
        {canAdd ? (
          <Link
            href="/admin/associati/nuovo"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
          >
            Nuovo associato
          </Link>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        {filtered.length} associat{filtered.length === 1 ? "o" : "i"}
      </p>

      <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessun associato trovato.
          </li>
        ) : (
          filtered.map((member) => (
            <li key={member.id}>
              <Link
                href={`/admin/associati/${member.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50"
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
                {member.memberNumber ? (
                  <span className="shrink-0 text-xs text-neutral-400">
                    n. {member.memberNumber}
                  </span>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
