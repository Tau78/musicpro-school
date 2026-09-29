"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type AdminNavMoreItem = {
  key: string;
  href: string;
  label: string;
  active: boolean;
};

export function AdminNavMoreButton({
  items,
  anyActive,
}: {
  items: AdminNavMoreItem[];
  anyActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={panelRef} className="relative flex flex-1 flex-col items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full flex-col items-center py-2 text-[11px] font-medium touch-manipulation ${
          anyActive || open ? "text-[var(--brand)]" : "text-neutral-500"
        }`}
      >
        <span>Altro</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Chiudi menu"
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute bottom-full z-50 mb-2 w-48 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 text-sm touch-manipulation ${
                  item.active
                    ? "bg-[var(--brand)]/5 font-medium text-[var(--brand)]"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
