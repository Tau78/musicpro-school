import type { ReactNode } from "react";

import { DocumentiSettingsLayout } from "@/components/admin/documenti-settings-layout";

export default function DocumentiLayout({ children }: { children: ReactNode }) {
  return <DocumentiSettingsLayout>{children}</DocumentiSettingsLayout>;
}
