"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  environmentLabel,
  formatBuiltAtRome,
  getAppBuildInfo,
} from "@/lib/app-build-info";

function InfoIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs font-medium text-neutral-500 sm:w-28">
        {label}
      </dt>
      <dd className="min-w-0 break-all text-sm text-neutral-900">{value}</dd>
    </div>
  );
}

export function AppInfoButton({
  className,
  label = "Informazioni app",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const info = getAppBuildInfo();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-[var(--brand)]"
        }
      >
        <InfoIcon size={22} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-info-title"
            className="max-h-[min(80vh,32rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="app-info-title"
                className="text-lg font-semibold text-[var(--brand)]"
              >
                {info.name}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 text-sm text-neutral-500 hover:text-neutral-800"
              >
                Chiudi
              </button>
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              Portale scuola MusicPro — prenotazioni sale, lezioni e
              amministrazione.
            </p>

            <dl className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
              <InfoRow label="Versione" value={info.version} />
              <InfoRow label="Build" value={info.buildId} />
              <InfoRow
                label="Data build"
                value={formatBuiltAtRome(info.builtAtIso)}
              />
              <InfoRow
                label="Ambiente"
                value={environmentLabel(info.environment)}
              />
            </dl>
          </div>
        </div>
      ) : null}
    </>
  );
}
