"use client";

import Link from "next/link";
import { useState } from "react";

import type { MemberDetail } from "@musicpro/database";

import { AssociatesBookButton } from "@/components/admin/associates-book-button";
import { CashEnrollmentCard } from "@/components/admin/cash-enrollment-card";
import { MemberList, type MemberListProps } from "@/components/admin/member-list";

type TabId = "rubrica" | "iscrizione" | "strumenti";

const TABS: { id: TabId; label: string }[] = [
  { id: "rubrica", label: "Rubrica" },
  { id: "iscrizione", label: "Iscrizione" },
  { id: "strumenti", label: "Strumenti" },
];

export function AssociatiWorkspace({
  memberDetails,
  showMerge,
  listProps,
}: {
  memberDetails: MemberDetail[];
  showMerge: boolean;
  listProps: Omit<MemberListProps, "canAdd">;
}) {
  const [tab, setTab] = useState<TabId>("rubrica");

  return (
    <div className="space-y-3">
      <div
        className="flex gap-1 overflow-x-auto rounded-lg bg-neutral-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Sezioni rubrica"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium touch-manipulation ${
              tab === item.id
                ? "bg-white text-[var(--brand)] shadow-sm"
                : "text-neutral-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "rubrica" ? (
        <MemberList {...listProps} canAdd={false} compact />
      ) : null}

      {tab === "iscrizione" ? <CashEnrollmentCard embedded /> : null}

      {tab === "strumenti" ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="mb-3 text-sm text-neutral-600">
            Export e manutenzione anagrafica.
          </p>
          <div className="flex flex-wrap gap-2">
            <AssociatesBookButton members={memberDetails} />
            {showMerge ? (
              <Link
                href="/admin/associati/duplicati"
                className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Compatta duplicati
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
