"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { landingPath, type UiSwitchOption, type UiView } from "@/lib/admin/ui-view";

export function RoleUiSwitch({
  active,
  options,
  tone,
}: {
  active: UiView;
  options: UiSwitchOption[];
  tone: "onBrand" | "onLight";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onBrand = tone === "onBrand";

  function choose(view: UiView) {
    if (view === active || pending) return;
    startTransition(async () => {
      const response = await fetch("/api/ui-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ view }),
      });
      if (!response.ok) return;
      const dest = landingPath(view, window.location.pathname);
      if (dest && dest !== window.location.pathname) {
        router.push(dest);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span
      className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-0.5 text-sm leading-tight ${
        pending ? "opacity-60" : ""
      } ${onBrand ? "text-white/75" : "text-neutral-500"}`}
    >
      <span aria-hidden>(</span>
      {options.map((option, index) => {
        const selected = option.view === active;
        return (
          <span key={option.view} className="inline-flex min-w-0 items-center">
            {index > 0 ? (
              <span aria-hidden className="px-0.5">
                ·
              </span>
            ) : null}
            <button
              type="button"
              aria-pressed={selected}
              disabled={pending}
              title={
                selected ? `UI ${option.label}` : `Apri UI ${option.label}`
              }
              onClick={() => choose(option.view)}
              className={`rounded-sm px-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${
                onBrand
                  ? "focus-visible:outline-white/80"
                  : "focus-visible:outline-[var(--brand)]"
              } ${
                selected
                  ? onBrand
                    ? "font-semibold text-white underline decoration-white/80 underline-offset-2"
                    : "font-semibold text-[var(--brand)] underline decoration-[var(--brand)]/70 underline-offset-2"
                  : onBrand
                    ? "font-normal text-white/70 hover:text-white"
                    : "font-normal text-neutral-500 hover:text-[var(--brand)]"
              }`}
            >
              {option.label}
            </button>
          </span>
        );
      })}
      <span aria-hidden>)</span>
    </span>
  );
}
