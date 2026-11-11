"use client";

import { useEffect, useRef, useState } from "react";

import {
  PayrollSignPad,
  type PayrollSignPadHandle,
} from "@/components/lezioni/payroll-sign-pad";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      html: string;
      associateName: string;
      docLabel: string;
      alreadySigned: boolean;
    }
  | { status: "done"; message: string };

export function ReimbursementSignClient({ token }: { token: string }) {
  const padRef = useRef<PayrollSignPadHandle>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPreview({ status: "error", message: "Link non valido." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/reimbursements/sign-preview?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          html?: string;
          associateName?: string;
          docLabel?: string;
          alreadySigned?: boolean;
        };
        if (cancelled) return;
        if (!res.ok || !data.success || !data.html) {
          setPreview({
            status: "error",
            message: data.message || "Impossibile caricare la notula.",
          });
          return;
        }
        setPreview({
          status: "ready",
          html: data.html,
          associateName: data.associateName || "",
          docLabel: data.docLabel || "",
          alreadySigned: Boolean(data.alreadySigned),
        });
      } catch {
        if (!cancelled) {
          setPreview({
            status: "error",
            message: "Errore di rete. Riprova.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSave() {
    setError(null);
    const png = padRef.current?.capture();
    if (!png) {
      setError("Disegna la firma prima di salvare.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/reimbursements/sign-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signaturePngBase64: png }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        warning?: string;
      };
      if (!res.ok || !data.success) {
        setError(data.message || "Salvataggio firma non riuscito.");
        setSaving(false);
        return;
      }
      setPreview({
        status: "done",
        message:
          data.message ||
          "Firma salvata. La segreteria è stata avvisata.",
      });
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  if (preview.status === "loading") {
    return (
      <p className="text-sm text-neutral-600">Caricamento notula…</p>
    );
  }

  if (preview.status === "error") {
    return (
      <div className="rounded-xl bg-white p-5 ring-1 ring-red-200">
        <h1 className="text-lg font-semibold text-neutral-900">
          Link non utilizzabile
        </h1>
        <p className="mt-2 text-sm text-red-700">{preview.message}</p>
      </div>
    );
  }

  if (preview.status === "done") {
    return (
      <div className="rounded-xl bg-white p-5 ring-1 ring-emerald-200">
        <h1 className="text-lg font-semibold text-neutral-900">Grazie</h1>
        <p className="mt-2 text-sm text-neutral-700">{preview.message}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <header className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-neutral-900">
          Firma rimborso spese
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {preview.docLabel}
          {preview.associateName ? ` · ${preview.associateName}` : ""}
        </p>
      </header>

      <div
        className="min-w-0 max-w-full overflow-x-auto rounded-xl bg-white p-3 ring-1 ring-neutral-200 sm:p-5 [&_body]:!m-0 [&_html]:!m-0"
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />

      {preview.alreadySigned ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Questa notula risulta già firmata.
        </p>
      ) : (
        <section className="min-w-0 max-w-full rounded-xl bg-white p-4 ring-1 ring-neutral-200">
          <h2 className="text-sm font-semibold text-neutral-900">
            La tua firma
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Firma nello spazio sotto, poi salva.
          </p>
          <div className="mt-3 min-w-0 max-w-full">
            <PayrollSignPad ref={padRef} disabled={saving} />
          </div>
          {error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
          <div className="mt-4 flex min-w-0 max-w-full flex-wrap gap-2">
            <button
              type="button"
              onClick={() => padRef.current?.clear()}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-sm text-[var(--brand)] ring-1 ring-[var(--brand)]"
            >
              Cancella
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-brand rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : "Firma e salva"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
