"use client";

import {
  settlementMethodLabel,
  type SettlementMethod,
} from "@musicpro/database";

interface SettlementMethodPickerProps {
  value: SettlementMethod | null;
  onChange: (value: SettlementMethod) => void;
  originalPaymentMethod?: string | null;
}

const OPTIONS: SettlementMethod[] = ["credits", "cash", "original_method"];

export function SettlementMethodPicker({
  value,
  onChange,
  originalPaymentMethod,
}: SettlementMethodPickerProps) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <legend className="px-1 text-sm font-medium text-amber-900">
        Come saldare la differenza di prezzo?
      </legend>
      <p className="text-xs text-amber-800">
        Il nuovo totale differisce dal precedente. Scegli come registrare il
        saldo.
        {originalPaymentMethod && (
          <>
            {" "}
            Metodo originale:{" "}
            <span className="font-medium">
              {originalPaymentMethod === "credits"
                ? "Crediti"
                : originalPaymentMethod === "stripe"
                  ? "Carta (Stripe)"
                  : originalPaymentMethod}
            </span>
            .
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              value === option
                ? "border-[var(--brand)] bg-white text-[var(--brand)]"
                : "border-amber-200 bg-white/70 text-neutral-700 hover:border-amber-300"
            }`}
          >
            <input
              type="radio"
              name="settlementMethod"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {settlementMethodLabel(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
