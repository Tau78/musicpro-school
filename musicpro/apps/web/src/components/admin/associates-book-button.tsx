"use client";

import { useState } from "react";

import type { MemberDetail } from "@musicpro/database";

interface AssociatesBookButtonProps {
  members: MemberDetail[];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("it-IT");
}

function tutorLine(m: MemberDetail): string | null {
  if (m.legacyTutorFullName || m.legacyTutorMemberNumber) {
    const name = m.legacyTutorFullName?.trim() || "—";
    const num = m.legacyTutorMemberNumber
      ? ` (Associato n. ${m.legacyTutorMemberNumber})`
      : "";
    return `${name}${num}`;
  }
  const manual = [m.manualTutorFirstName, m.manualTutorLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (manual) return `${manual} (manuale)`;
  return null;
}

function buildPrintHtml(members: MemberDetail[]): string {
  const generated = new Date().toLocaleString("it-IT");
  const sorted = [...members].sort((a, b) => {
    const ln = a.lastName.localeCompare(b.lastName, "it", {
      sensitivity: "base",
    });
    if (ln !== 0) return ln;
    return a.firstName.localeCompare(b.firstName, "it", {
      sensitivity: "base",
    });
  });

  const blocks = sorted
    .map((m) => {
      const address = [
        m.addressStreet,
        [m.addressPostalCode, m.addressCity].filter(Boolean).join(" "),
        m.addressProvince ? `(${m.addressProvince})` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const tutor = tutorLine(m);
      return `
        <article class="entry">
          <h2>${escapeHtml(m.lastName)} ${escapeHtml(m.firstName)}</h2>
          <dl>
            <dt>Numero</dt><dd>${m.memberNumber ?? "—"}</dd>
            <dt>Data iscrizione</dt><dd>${escapeHtml(formatDate(m.enrolledAt))}</dd>
            <dt>Data nascita</dt><dd>${escapeHtml(formatDate(m.birthDate))}</dd>
            <dt>Luogo nascita</dt><dd>${escapeHtml(
              [m.birthPlace, m.birthProvince].filter(Boolean).join(" ") || "—",
            )}</dd>
            <dt>Indirizzo</dt><dd>${escapeHtml(address || "—")}</dd>
            <dt>Codice fiscale</dt><dd>${escapeHtml(m.taxCode || "—")}</dd>
            <dt>Cellulare</dt><dd>${escapeHtml(m.phone || "—")}</dd>
            <dt>Email</dt><dd>${escapeHtml(m.email || "—")}</dd>
            ${
              tutor
                ? `<dt>Tutore</dt><dd>${escapeHtml(tutor)}</dd>`
                : ""
            }
          </dl>
        </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Libro Associati — MusicPro School</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 2rem; line-height: 1.45; }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .entry { break-inside: avoid; border-top: 1px solid #ccc; padding: 1rem 0; }
    .entry h2 { font-size: 1.1rem; margin: 0 0 0.5rem; }
    dl { display: grid; grid-template-columns: 10rem 1fr; gap: 0.25rem 1rem; margin: 0; font-size: 0.95rem; }
    dt { color: #666; }
    dd { margin: 0; }
    @media print {
      body { margin: 1rem; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="no-print"><button onclick="window.print()">Stampa / Salva PDF</button></p>
  <h1>Libro Associati</h1>
  <p class="meta">MusicPro School · Generato il ${escapeHtml(generated)} · ${sorted.length} associati</p>
  ${blocks}
  <script>window.onload = function () { /* ready for print */ };</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function AssociatesBookButton({ members }: AssociatesBookButtonProps) {
  const [busy, setBusy] = useState(false);

  function openBook() {
    setBusy(true);
    try {
      const html = buildPrintHtml(members);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Fallback: download HTML
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
