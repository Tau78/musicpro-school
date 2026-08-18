"use client";

import { useId, useState } from "react";

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left touch-manipulation hover:bg-neutral-50"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-[var(--brand)]">
            {title}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs text-neutral-500">
              {description}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          className={`mt-0.5 shrink-0 text-xs text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="space-y-4 border-t border-neutral-100 px-4 py-4"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
