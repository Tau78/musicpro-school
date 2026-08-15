import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type PenaltiesClient = SupabaseClient<Database>;

export interface CancellationPenaltyRule {
  id: string;
  fromHours: number;
  toHours: number;
  penaltyPercent: number;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type CancellationPenaltyRuleInput = Omit<
  CancellationPenaltyRule,
  "id" | "createdAt" | "updatedAt"
>;

export interface PenaltyMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

type PenaltyRuleRow = {
  id: string;
  from_hours: number;
  to_hours: number;
  penalty_percent: number;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const PENALTY_RULE_COLUMNS =
  "id, from_hours, to_hours, penalty_percent, enabled, sort_order, created_at, updated_at";

function mapPenaltyRule(row: PenaltyRuleRow): CancellationPenaltyRule {
  return {
    id: row.id,
    fromHours: Number(row.from_hours),
    toHours: Number(row.to_hours),
    penaltyPercent: row.penalty_percent,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPenaltyInput(input: CancellationPenaltyRuleInput) {
  return {
    from_hours: input.fromHours,
    to_hours: input.toHours,
    penalty_percent: input.penaltyPercent,
    enabled: input.enabled,
    sort_order: input.sortOrder,
  };
}

function validatePenaltyInput(
  input: CancellationPenaltyRuleInput,
): string | null {
  if (input.fromHours <= input.toHours) {
    return "Il limite superiore (da ore) deve essere maggiore del limite inferiore (a ore).";
  }

  if (input.penaltyPercent < 0 || input.penaltyPercent > 100) {
    return "La penale deve essere tra 0 e 100%.";
  }

  return null;
}

export async function listCancellationPenaltyRules(
  client: PenaltiesClient,
): Promise<CancellationPenaltyRule[]> {
  const { data, error } = await client
    .from("cancellation_penalty_rules")
    .select(PENALTY_RULE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("from_hours", { ascending: false });

  if (error) {
    throw new Error(`Impossibile caricare le penali: ${error.message}`);
  }

  return (data ?? []).map((row) => mapPenaltyRule(row as PenaltyRuleRow));
}

export async function createCancellationPenaltyRule(
  client: PenaltiesClient,
  input: CancellationPenaltyRuleInput,
): Promise<PenaltyMutationResult> {
  const validationError = validatePenaltyInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { data, error } = await client
    .from("cancellation_penalty_rules")
    .insert(mapPenaltyInput(input))
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare la regola.",
    };
  }

  return { success: true, id: data.id };
}

export async function updateCancellationPenaltyRule(
  client: PenaltiesClient,
  ruleId: string,
  input: CancellationPenaltyRuleInput,
): Promise<PenaltyMutationResult> {
  const validationError = validatePenaltyInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { error } = await client
    .from("cancellation_penalty_rules")
    .update(mapPenaltyInput(input))
    .eq("id", ruleId);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare la regola.",
    };
  }

  return { success: true, id: ruleId };
}

export async function deleteCancellationPenaltyRule(
  client: PenaltiesClient,
  ruleId: string,
): Promise<PenaltyMutationResult> {
  const { error } = await client
    .from("cancellation_penalty_rules")
    .delete()
    .eq("id", ruleId);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare la regola.",
    };
  }

  return { success: true };
}
