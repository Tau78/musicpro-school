import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type CreditsClient = SupabaseClient<Database>;

export type CreditTransactionType =
  | "purchase"
  | "debit"
  | "hold"
  | "release"
  | "refund"
  | "adjustment"
  | "penalty";

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceEur: number;
  enabled: boolean;
  sortOrder: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreditPackageInput = Omit<
  CreditPackage,
  "id" | "createdAt" | "updatedAt"
>;

export interface CreditTransaction {
  id: string;
  memberId: string;
  amount: number;
  type: CreditTransactionType;
  bookingId: string | null;
  purchaseId: string | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CreditPurchase {
  id: string;
  memberId: string;
  packageId: string;
  creditsGranted: number;
  amountPaidEur: number;
  stripePaymentIntentId: string | null;
  stripeEventId: string | null;
  paymentLinkId: string | null;
  paymentStatus: string;
  createdAt: string;
  package?: Pick<CreditPackage, "id" | "name" | "credits" | "priceEur"> | null;
}

export interface MemberCreditBalance {
  available: number;
  held: number;
  total: number;
}

export interface CreditMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

export interface AdminAdjustCreditsResult {
  success: boolean;
  transactionId?: string;
  balance?: MemberCreditBalance;
  errorMessage?: string;
}

export interface BookingCreditsPaymentResult {
  success: boolean;
  action?: "hold" | "debit";
  creditsHeld?: number;
  creditsUsed?: number;
  status?: string;
  paymentStatus?: string;
  duplicate?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

type CreditPackageRow = {
  id: string;
  name: string;
  credits: number;
  price_eur: number;
  enabled: boolean;
  sort_order: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type CreditTransactionRow = {
  id: string;
  member_id: string;
  amount: number;
  type: CreditTransactionType;
  booking_id: string | null;
  purchase_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

type CreditPurchaseRow = {
  id: string;
  member_id: string;
  package_id: string;
  credits_granted: number;
  amount_paid_eur: number;
  stripe_payment_intent_id: string | null;
  stripe_event_id: string | null;
  payment_link_id: string | null;
  payment_status: string;
  created_at: string;
};

const CREDIT_PACKAGE_COLUMNS =
  "id, name, credits, price_eur, enabled, sort_order, description, created_at, updated_at";

const CREDIT_TRANSACTION_COLUMNS =
  "id, member_id, amount, type, booking_id, purchase_id, reason, created_by, created_at";

const CREDIT_PURCHASE_COLUMNS =
  "id, member_id, package_id, credits_granted, amount_paid_eur, stripe_payment_intent_id, stripe_event_id, payment_link_id, payment_status, created_at";

interface MemberCreditBalanceResponse {
  available?: number;
  held?: number;
  total?: number;
}

interface AdminAdjustCreditsResponse {
  success: boolean;
  transaction_id?: string;
  balance?: MemberCreditBalanceResponse;
  error_message?: string;
  message?: string;
}

interface BookingCreditsRpcResponse {
  success: boolean;
  error_code?: string;
  error_message?: string;
  duplicate?: boolean;
  credits_held?: number;
  credits_used?: number;
  status?: string;
  payment_status?: string;
}

/** 1 credito = 1 ora di prenotazione (arrotondamento per eccesso). */
export function creditsForBookingDuration(durationMinutes: number): number {
  return Math.ceil(durationMinutes / 60);
}

function mapCreditPackage(row: CreditPackageRow): CreditPackage {
  return {
    id: row.id,
    name: row.name,
    credits: row.credits,
    priceEur: Number(row.price_eur),
    enabled: row.enabled,
    sortOrder: row.sort_order,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCreditTransaction(row: CreditTransactionRow): CreditTransaction {
  return {
    id: row.id,
    memberId: row.member_id,
    amount: row.amount,
    type: row.type,
    bookingId: row.booking_id,
    purchaseId: row.purchase_id,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapCreditPurchase(row: CreditPurchaseRow): CreditPurchase {
  return {
    id: row.id,
    memberId: row.member_id,
    packageId: row.package_id,
    creditsGranted: row.credits_granted,
    amountPaidEur: Number(row.amount_paid_eur),
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeEventId: row.stripe_event_id,
    paymentLinkId: row.payment_link_id,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
  };
}

function creditPackageInputToRow(
  input: CreditPackageInput,
): Record<string, unknown> {
  return {
    name: input.name.trim(),
    credits: input.credits,
    price_eur: input.priceEur,
    enabled: input.enabled,
    sort_order: input.sortOrder,
    description: emptyToNull(input.description),
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function mapMemberCreditBalance(
  data: MemberCreditBalanceResponse | null,
): MemberCreditBalance {
  return {
    available: data?.available ?? 0,
    held: data?.held ?? 0,
    total: data?.total ?? 0,
  };
}

export async function listCreditPackages(
  client: CreditsClient,
): Promise<CreditPackage[]> {
  const { data, error } = await client
    .from("credit_packages")
    .select(CREDIT_PACKAGE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare i pacchetti crediti: ${error.message}`);
  }

  return ((data ?? []) as CreditPackageRow[]).map(mapCreditPackage);
}

export async function getCreditPackageById(
  client: CreditsClient,
  id: string,
): Promise<CreditPackage | null> {
  const { data, error } = await client
    .from("credit_packages")
    .select(CREDIT_PACKAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare il pacchetto crediti: ${error.message}`);
  }

  if (!data) return null;

  return mapCreditPackage(data as CreditPackageRow);
}

export async function listActiveCreditPackages(
  client: CreditsClient,
): Promise<CreditPackage[]> {
  const { data, error } = await client
    .from("credit_packages")
    .select(CREDIT_PACKAGE_COLUMNS)
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare i pacchetti crediti disponibili: ${error.message}`,
    );
  }

  return ((data ?? []) as CreditPackageRow[]).map(mapCreditPackage);
}

export async function createCreditPackage(
  client: CreditsClient,
  input: CreditPackageInput,
): Promise<CreditMutationResult> {
  const { data, error } = await client
    .from("credit_packages")
    .insert(creditPackageInputToRow(input) as never)
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return {
    success: true,
    id: (data as { id: string }).id,
  };
}

export async function updateCreditPackage(
  client: CreditsClient,
  id: string,
  input: CreditPackageInput,
): Promise<CreditMutationResult> {
  const { error } = await client
    .from("credit_packages")
    .update(creditPackageInputToRow(input) as never)
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true, id };
}

export async function deleteCreditPackage(
  client: CreditsClient,
  id: string,
): Promise<CreditMutationResult> {
  const { error } = await client.from("credit_packages").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true };
}

export async function getMemberCreditBalance(
  client: CreditsClient,
  memberId: string,
): Promise<MemberCreditBalance> {
  const { data, error } = await client.rpc("get_member_credit_balance", {
    p_member_id: memberId,
  });

  if (error) {
    throw new Error(`Impossibile caricare il saldo crediti: ${error.message}`);
  }

  const result = data as (MemberCreditBalanceResponse & { success?: boolean; error_message?: string }) | null;

  if (result?.success === false) {
    throw new Error(
      result.error_message ?? "Impossibile caricare il saldo crediti.",
    );
  }

  return mapMemberCreditBalance(result);
}

export async function holdBookingCredits(
  client: CreditsClient,
  bookingId: string,
  credits: number,
): Promise<BookingCreditsPaymentResult> {
  const { data, error } = await client.rpc("hold_booking_credits", {
    p_booking_id: bookingId,
    p_credits: credits,
  });

  if (error) {
    return { success: false, errorMessage: error.message };
  }

  return mapBookingCreditsRpcResult(data as BookingCreditsRpcResponse | null, "hold");
}

export async function debitBookingCredits(
  client: CreditsClient,
  bookingId: string,
  credits?: number,
): Promise<BookingCreditsPaymentResult> {
  const { data, error } = await client.rpc("debit_booking_credits", {
    p_booking_id: bookingId,
    p_credits: credits ?? undefined,
  });

  if (error) {
    return { success: false, errorMessage: error.message };
  }

  return mapBookingCreditsRpcResult(data as BookingCreditsRpcResponse | null, "debit");
}

function mapBookingCreditsRpcResult(
  result: BookingCreditsRpcResponse | null,
  action: "hold" | "debit",
): BookingCreditsPaymentResult {
  if (!result?.success) {
    return {
      success: false,
      errorCode: result?.error_code,
      errorMessage:
        result?.error_message ??
        (action === "hold"
          ? "Impossibile riservare i crediti."
          : "Impossibile addebitare i crediti."),
    };
  }

  return {
    success: true,
    action,
    creditsHeld: result.credits_held,
    creditsUsed: result.credits_used,
    status: result.status,
    paymentStatus: result.payment_status,
    duplicate: result.duplicate,
  };
}

export async function listMemberCreditTransactions(
  client: CreditsClient,
  memberId: string,
  limit = 50,
): Promise<CreditTransaction[]> {
  const { data, error } = await client
    .from("credit_transactions")
    .select(CREDIT_TRANSACTION_COLUMNS)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Impossibile caricare i movimenti crediti: ${error.message}`,
    );
  }

  return ((data ?? []) as CreditTransactionRow[]).map(mapCreditTransaction);
}

export async function adminAdjustMemberCredits(
  client: CreditsClient,
  memberId: string,
  amount: number,
  reason: string,
): Promise<AdminAdjustCreditsResult> {
  const { data, error } = await client.rpc("admin_adjust_member_credits", {
    p_member_id: memberId,
    p_amount: amount,
    p_reason: reason.trim(),
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  const result = data as AdminAdjustCreditsResponse | null;

  if (!result?.success) {
    return {
      success: false,
      errorMessage:
        result?.error_message ??
        result?.message ??
        "Impossibile aggiornare i crediti dell'associato.",
    };
  }

  return {
    success: true,
    transactionId: result.transaction_id,
    balance: result.balance
      ? mapMemberCreditBalance(result.balance)
      : undefined,
  };
}

export async function listMemberCreditPurchases(
  client: CreditsClient,
  memberId: string,
): Promise<CreditPurchase[]> {
  const { data, error } = await client
    .from("credit_purchases")
    .select(CREDIT_PURCHASE_COLUMNS)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Impossibile caricare gli acquisti crediti: ${error.message}`,
    );
  }

  const purchases = ((data ?? []) as CreditPurchaseRow[]).map(mapCreditPurchase);

  if (purchases.length === 0) {
    return [];
  }

  const packageIds = [...new Set(purchases.map((purchase) => purchase.packageId))];
  const { data: packages, error: packagesError } = await client
    .from("credit_packages")
    .select("id, name, credits, price_eur")
    .in("id", packageIds);

  if (packagesError) {
    throw new Error(
      `Impossibile caricare i pacchetti crediti: ${packagesError.message}`,
    );
  }

  const packageById = new Map(
    ((packages ?? []) as Array<{
      id: string;
      name: string;
      credits: number;
      price_eur: number;
    }>).map((pkg) => [
      pkg.id,
      {
        id: pkg.id,
        name: pkg.name,
        credits: pkg.credits,
        priceEur: Number(pkg.price_eur),
      },
    ]),
  );

  return purchases.map((purchase) => ({
    ...purchase,
    package: packageById.get(purchase.packageId) ?? null,
  }));
}
