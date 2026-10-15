import { formatDateItalian, type CreditTransactionType } from "@musicpro/database";

export const CREDIT_TRANSACTION_TYPE_LABELS: Record<CreditTransactionType, string> =
  {
    purchase: "Acquisto",
    debit: "Addebito",
    hold: "Blocco",
    release: "Rilascio",
    refund: "Rimborso",
    adjustment: "Rettifica",
    penalty: "Penale",
  };

export function formatCreditAmount(amount: number): string {
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${amount}`;
}

export function formatCreditTransactionWhen(iso: string): string {
  const date = formatDateItalian(iso);
  const time = new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}
