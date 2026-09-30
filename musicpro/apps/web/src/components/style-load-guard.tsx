"use client";

import { useEffect } from "react";

/**
 * Marker class definita solo in globals.css (bundle Tailwind).
 * NON va messa nel CSS critico inline, altrimenti il probe è un falso positivo.
 */
const PROBE_CLASS = "mps-tw-ok";
const SESSION_KEY = "mps-css-force-v2";

function twApplied(): boolean {
  const probe = document.createElement("div");
  probe.className = PROBE_CLASS;
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const ok = getComputedStyle(probe).getPropertyValue("--mps-tw").trim() === "1";
  document.body.removeChild(probe);
  return ok;
}

async function injectStylesheetsInline(): Promise<number> {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  );
  let injected = 0;

  await Promise.all(
    links.map(async (link) => {
      const href = link.href;
      if (!href || link.dataset.mpsForced === "1") return;
      try {
        const url = new URL(href, window.location.href);
        url.searchParams.set("mpscb", String(Date.now()));
        const res = await fetch(url.toString(), {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const css = await res.text();
        if (css.length < 200) return;
        const style = document.createElement("style");
        style.dataset.mpsForced = "1";
        style.textContent = css;
        document.head.appendChild(style);
        link.dataset.mpsForced = "1";
        injected += 1;
      } catch {
        /* rete / CORS: fallback sotto */
      }
    }),
  );

  return injected;
}

function relinkStylesheets(): void {
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      if (!link.href || link.dataset.mpsRelinked === "1") return;
      try {
        const url = new URL(link.href, window.location.href);
        url.searchParams.set("mpscb", String(Date.now()));
        const neu = link.cloneNode(true) as HTMLLinkElement;
        neu.href = url.toString();
        neu.dataset.mpsRelinked = "1";
        link.replaceWith(neu);
      } catch {
        /* ignore */
      }
    });
}

/**
 * Se il CSS di Next/Tailwind non è applicato (HTML stale → 404 hash, o
 * Chrome Android che non applica il link), fetch + inject inline, poi reload.
 */
export function StyleLoadGuard() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      if (cancelled || twApplied()) return;

      await injectStylesheetsInline();
      if (cancelled) return;
      if (twApplied()) return;

      relinkStylesheets();
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled || twApplied()) return;

      try {
        if (sessionStorage.getItem(SESSION_KEY)) return;
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        return;
      }
      window.location.reload();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
