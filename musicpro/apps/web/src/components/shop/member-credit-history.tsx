"use client";

import { useEffect, useRef, useState } from "react";

import type { CreditTransaction } from "@musicpro/database";

import { CreditTransactionList } from "@/components/shop/credit-transaction-list";

interface MemberCreditHistoryProps {
  transactions: CreditTransaction[];
}

export function MemberCreditHistory({ transactions }: MemberCreditHistoryProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const shouldOpen =
      window.location.hash === "#storico" ||
      new URLSearchParams(window.location.search).get("storico") === "1";
    if (shouldOpen) {
      setOpen(true);
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <details
      ref={detailsRef}
      id="storico"
      open={open}
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
      className="group mt-4 rounded-xl border border-neutral-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-[var(--brand)]">
          Storico movimenti
          <span className="ml-2 font-normal text-neutral-500">
            ({transactions.length})
          </span>
        </span>
        <span
          aria-hidden
          className="text-neutral-400 transition group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200">
        <CreditTransactionList transactions={transactions} />
      </div>
    </details>
  );
}
