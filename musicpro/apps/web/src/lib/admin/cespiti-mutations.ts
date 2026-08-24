import {
  createFixedAsset,
  findDuplicateMatches,
  updateFixedAsset,
  type FixedAssetInput,
} from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FixedAssetWriteOptions {
  forceDuplicate?: boolean;
  actorMemberId?: string | null;
  excludeId?: string;
}

export type FixedAssetWriteResult =
  | {
      ok: true;
      id: string;
      merged?: boolean;
    }
  | {
      ok: false;
      status: 409;
      duplicates: Awaited<ReturnType<typeof findDuplicateMatches>>;
    }
  | {
      ok: false;
      status: 400;
      message: string;
    };

function withActor(
  input: FixedAssetInput,
  actorMemberId?: string | null,
): FixedAssetInput {
  return {
    ...input,
    createdBy: input.createdBy ?? actorMemberId ?? null,
    updatedBy: input.updatedBy ?? actorMemberId ?? null,
  };
}

export async function createFixedAssetHandlingDuplicates(
  client: SupabaseClient,
  input: FixedAssetInput,
  options: FixedAssetWriteOptions = {},
): Promise<FixedAssetWriteResult> {
  const payload = withActor(input, options.actorMemberId);
  const duplicates = await findDuplicateMatches(client, payload);

  if (duplicates.length > 0 && !options.forceDuplicate) {
    return { ok: false, status: 409, duplicates };
  }

  const created = await createFixedAsset(client, payload);
  if (!created.success || !created.id) {
    return {
      ok: false,
      status: 400,
      message: created.errorMessage ?? "Impossibile creare il cespite.",
    };
  }

  return { ok: true, id: created.id };
}

export async function updateFixedAssetHandlingDuplicates(
  client: SupabaseClient,
  id: string,
  input: FixedAssetInput,
  options: FixedAssetWriteOptions = {},
): Promise<FixedAssetWriteResult> {
  const payload = withActor(input, options.actorMemberId);
  const duplicates = await findDuplicateMatches(client, payload, id);

  if (duplicates.length > 0 && !options.forceDuplicate) {
    return { ok: false, status: 409, duplicates };
  }

  const updated = await updateFixedAsset(client, id, payload);
  if (!updated.success) {
    return {
      ok: false,
      status: 400,
      message: updated.errorMessage ?? "Impossibile aggiornare il cespite.",
    };
  }

  return { ok: true, id };
}
