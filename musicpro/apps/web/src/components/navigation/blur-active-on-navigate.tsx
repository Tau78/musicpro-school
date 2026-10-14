"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Su soft-nav, toglie il focus da input/select/date.
 * In WKWebView iOS il picker nativo può lasciare un velo che mangia i tap.
 */
export function BlurActiveOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }, [pathname]);

  return null;
}
