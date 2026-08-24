export const VERBALI_SCADENZIARIO_SETTING_KEY = "verbali_scadenziario_state";

export const SCADENZIARIO_ITEMS = [
  {
    id: "libro_associati",
    title: "Libro associati",
    description:
      "Registro degli associati aggiornato con iscrizioni, dimissioni e variazioni.",
    frequency: "Aggiornamento annuale (e ad ogni variazione)",
  },
  {
    id: "verbali_assemblea",
    title: "Verbali assemblea",
    description:
      "Verbale dell'assemblea ordinaria annuale con approvazione bilancio e nomina organi.",
    frequency: "Assemblea ordinaria annuale",
  },
  {
    id: "verbali_consiglio",
    title: "Verbali consiglio direttivo",
    description:
      "Verbali delle riunioni del consiglio direttivo e delle delibere assunte.",
    frequency: "Dopo ogni riunione del consiglio",
  },
  {
    id: "bilancio_rendiconto",
    title: "Bilancio / rendiconto",
    description:
      "Bilancio d'esercizio o rendiconto per associazioni di promozione sociale (ETS).",
    frequency: "Chiusura esercizio annuale",
  },
  {
    id: "registro_volontari",
    title: "Registro volontari",
    description:
      "Registro delle prestazioni volontarie, se l'associazione fa ricorso al volontariato.",
    frequency: "Se applicabile · aggiornamento continuo",
  },
] as const;

export type ScadenziarioItemId = (typeof SCADENZIARIO_ITEMS)[number]["id"];

export type VerbaliScadenziarioState = Partial<
  Record<ScadenziarioItemId, boolean>
>;

export function emptyScadenziarioState(): VerbaliScadenziarioState {
  return Object.fromEntries(
    SCADENZIARIO_ITEMS.map((item) => [item.id, false]),
  ) as VerbaliScadenziarioState;
}

export function parseScadenziarioState(raw: string | null | undefined): VerbaliScadenziarioState {
  const base = emptyScadenziarioState();

  if (!raw?.trim()) {
    return base;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return base;
    }

    for (const item of SCADENZIARIO_ITEMS) {
      const value = (parsed as Record<string, unknown>)[item.id];
      if (typeof value === "boolean") {
        base[item.id] = value;
      }
    }
  } catch {
    return base;
  }

  return base;
}

export function sanitizeScadenziarioState(
  input: unknown,
): VerbaliScadenziarioState {
  const base = emptyScadenziarioState();

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return base;
  }

  for (const item of SCADENZIARIO_ITEMS) {
    const value = (input as Record<string, unknown>)[item.id];
    if (typeof value === "boolean") {
      base[item.id] = value;
    }
  }

  return base;
}
