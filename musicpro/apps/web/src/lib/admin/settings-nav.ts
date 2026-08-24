export const SETTINGS_PATH_PREFIXES = [
  "/admin/impostazioni",
  "/admin/quote",
  "/admin/sale",
  "/admin/shop",
  "/admin/template",
  "/admin/penali",
] as const;

export function isSettingsPath(pathname: string): boolean {
  return SETTINGS_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function firstSettingsHref(flags: {
  showQuote: boolean;
  showSale: boolean;
  showShop: boolean;
  showPrenotazioniSettings: boolean;
  showDocumenti: boolean;
  showUtenti?: boolean;
}): string {
  if (flags.showQuote) return "/admin/quote";
  if (flags.showSale) return "/admin/sale";
  if (flags.showShop) return "/admin/shop";
  if (flags.showPrenotazioniSettings) return "/admin/impostazioni";
  if (flags.showDocumenti) return "/admin/impostazioni/documenti";
  if (flags.showUtenti) return "/admin/impostazioni/utenti";
  return "/admin/impostazioni";
}

export const DOCUMENTI_SETTING_KEYS = [
  "admin_email",
  "segreteria_email",
  "storage_bucket_reimbursements",
  "storage_bucket_enrollments",
  "legacy_spreadsheet_id",
  "timezone",
] as const;

export const DRIVE_SETTING_KEYS = [
  "root_reimbursements_folder_id",
  "root_enrollments_folder_id",
] as const;

export const TEMPLATE_SETTING_KEYS = [
  "reimbursement_template_id",
  "enrollment_template_id",
] as const;
