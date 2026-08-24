"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isDocumentiPath } from "@/lib/admin/documenti-nav";

interface DocumentiSubNavProps {
  children: ReactNode;
}

/** Path gate for /admin/documenti; side nav lives in documenti/layout. */
export function DocumentiSubNav({ children }: DocumentiSubNavProps) {
  const pathname = usePathname();

  if (!isDocumentiPath(pathname)) {
    return children;
  }

  return children;
}
