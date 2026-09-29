"use client";

import { useEffect } from "react";

/**
 * Se il CSS di Next/Tailwind non è applicato (HTML in cache su CSS già 404),
 * forza un unico reload di sessione.
 */
export function StyleLoadGuard() {
  useEffect(() => {
    const probe = document.createElement("div");
    probe.className = "flex";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    document.body.appendChild(probe);
    const display = getComputedStyle(probe).display;
    document.body.removeChild(probe);

    if (display === "flex") return;

    const key = "mps-css-reload-v1";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, []);

  return null;
}
