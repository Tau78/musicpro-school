import {
  MEMBER_ROLE_LABELS,
  MemberRole,
  type MemberRoleValue,
} from "@musicpro/shared";

/** Vista UI per chi ha più di un ruolo tra admin, docente e associato. */
export type UiView = "admin" | "docente" | "associato";

export const UI_VIEW_COOKIE = "mps_ui_view";

const VIEW_ROLE: Record<UiView, MemberRole> = {
  admin: MemberRole.Admin,
  docente: MemberRole.Docente,
  associato: MemberRole.Associato,
};

const PERSONAL_ASSOCIATE_PREFIXES = ["/dashboard/rette", "/dashboard/shop"];

export type UiSwitchOption = {
  view: UiView;
  label: string;
};

export function switchableUiViews(roles: MemberRoleValue[]): UiView[] {
  const views: UiView[] = [];
  if (roles.includes(MemberRole.Admin)) views.push("admin");
  if (roles.includes(MemberRole.Docente)) views.push("docente");
  if (roles.includes(MemberRole.Associato)) views.push("associato");
  return views;
}

export function canSwitchUi(roles: MemberRoleValue[]): boolean {
  return switchableUiViews(roles).length >= 2;
}

/** Prima apertura: Admin se c’è, altrimenti la prima vista disponibile. */
export function defaultUiView(roles: MemberRoleValue[]): UiView | null {
  const views = switchableUiViews(roles);
  if (views.length < 2) return null;
  if (views.includes("admin")) return "admin";
  return views[0] ?? null;
}

export function parseUiView(
  raw: string | undefined,
  roles: MemberRoleValue[],
): UiView | null {
  if (!canSwitchUi(roles)) return null;
  const views = switchableUiViews(roles);
  if (
    (raw === "admin" || raw === "docente" || raw === "associato") &&
    views.includes(raw)
  ) {
    return raw;
  }
  return defaultUiView(roles);
}

export function uiSwitchOptions(roles: MemberRoleValue[]): UiSwitchOption[] {
  return switchableUiViews(roles).map((view) => ({
    view,
    label: MEMBER_ROLE_LABELS[VIEW_ROLE[view]],
  }));
}

/**
 * Ruoli usati solo per menu e pagine.
 * I permessi reali restano su `member.roles`.
 */
export function presentationRoles(
  roles: MemberRoleValue[],
  view: UiView | null,
): MemberRoleValue[] {
  if (!view || !canSwitchUi(roles)) return roles;
  if (view === "admin") {
    return roles.filter(
      (role) =>
        role !== MemberRole.Docente &&
        role !== MemberRole.Associato &&
        role !== MemberRole.Tutore,
    );
  }
  if (view === "docente") {
    return roles.filter(
      (role) => role === MemberRole.Docente || role === MemberRole.Tutore,
    );
  }
  return roles.filter(
    (role) => role === MemberRole.Associato || role === MemberRole.Tutore,
  );
}

function isPersonalAssociatePath(pathname: string): boolean {
  return PERSONAL_ASSOCIATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Dove andare se la pagina non appartiene alla vista. `null` = resta. */
export function landingPath(view: UiView, pathname: string): string | null {
  if (view === "admin") {
    if (pathname === "/lezioni" || pathname.startsWith("/lezioni/")) {
      return "/admin/lezioni";
    }
    if (isPersonalAssociatePath(pathname)) return "/dashboard";
    return null;
  }

  if (view === "docente") {
    if (
      pathname.startsWith("/admin") &&
      !pathname.startsWith("/admin/rimborsi")
    ) {
      return "/dashboard";
    }
    if (isPersonalAssociatePath(pathname)) return "/dashboard";
    return null;
  }

  if (
    pathname.startsWith("/admin") ||
    pathname === "/lezioni" ||
    pathname.startsWith("/lezioni/")
  ) {
    return "/dashboard";
  }
  return null;
}
