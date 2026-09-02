/**
 * Drive / Storage layout matching legacy GAS:
 *   {root}/Rimborsi {year}/{lastName}/{progressive}-{year} - {associateName}.pdf
 */

export function reimbursementYearFolder(fiscalYear: number): string {
  return `Rimborsi ${fiscalYear}`;
}

/** Last word of the associate display name (GAS: associateName.split(' ').pop()). */
export function reimbursementAssociateFolder(associateName: string): string {
  const parts = associateName.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "SenzaNome";
}

export function reimbursementPdfFilename(params: {
  progressive: string;
  fiscalYear: number;
  associateName: string;
}): string {
  const progressive = String(params.progressive || "").trim() || "00";
  const name = params.associateName.trim() || "Associato";
  return `${progressive}-${params.fiscalYear} - ${name}.pdf`;
}

export function reimbursementStoragePath(params: {
  progressive: string;
  fiscalYear: number;
  associateName: string;
}): string {
  return [
    reimbursementYearFolder(params.fiscalYear),
    reimbursementAssociateFolder(params.associateName),
    reimbursementPdfFilename(params),
  ].join("/");
}
