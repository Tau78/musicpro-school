"use client";

import { useState } from "react";

import type { MemberDetail } from "@musicpro/database";

import { buildAssociatesBookHtml } from "@/lib/documenti/associates-book-html";

interface AssociatesBookButtonProps {
  members: MemberDetail[];
}

export function AssociatesBookButton({ members }: AssociatesBookButtonProps) {
  const [busy, setBusy] = useState(false);

  function openBook() {
    setBusy(true);
    try {
      const html = buildAssociatesBookHtml(members);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `libro-associati-${new Date().toISOString().slice(0, 10)}.html`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openBook}
      disabled={busy || members.length === 0}
      className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
    >
      {busy ? "Generazione…" : "Libro associati"}
    </button>
  );
}
