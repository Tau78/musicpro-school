import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { MemberRoleValue } from "@musicpro/shared";

import {
  landingPath,
  parseUiView,
  presentationRoles,
  UI_VIEW_COOKIE,
  type UiView,
} from "@/lib/admin/ui-view";

export type UiContext = {
  view: UiView | null;
  /** Ruoli da usare per nav e contenuti. */
  roles: MemberRoleValue[];
  switching: boolean;
};

export const getUiContext = cache(
  async (roles: MemberRoleValue[]): Promise<UiContext> => {
    const jar = await cookies();
    const view = parseUiView(jar.get(UI_VIEW_COOKIE)?.value, roles);
    return {
      view,
      roles: presentationRoles(roles, view),
      switching: view != null,
    };
  },
);

export async function getRequestPathname(): Promise<string> {
  const headerList = await headers();
  const path = headerList.get("x-pathname")?.trim() ?? "";
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

/** Se la URL non è della vista attiva, manda alla home di quella vista. */
export async function redirectForUiView(
  roles: MemberRoleValue[],
  pathname: string,
): Promise<UiContext> {
  const ctx = await getUiContext(roles);
  if (!ctx.view || !pathname) return ctx;
  const dest = landingPath(ctx.view, pathname);
  if (dest && dest !== pathname) redirect(dest);
  return ctx;
}
