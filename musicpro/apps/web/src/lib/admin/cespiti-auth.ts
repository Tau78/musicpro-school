import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { MemberRole } from "@musicpro/shared";
import type { Database } from "@musicpro/database";

import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiSubsection,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { createClient } from "@/lib/supabase/server";

export const CESPITI_STORAGE_BUCKET = "fixed_assets";

export type CespitiAccess =
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      serviceSupabase: ReturnType<typeof createServiceClient<Database>>;
      member: NonNullable<Awaited<ReturnType<typeof getAdminMember>>>;
      isAdmin: boolean;
      error: null;
    }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      serviceSupabase: null;
      member: null;
      isAdmin: false;
      error: NextResponse;
    };

function createServiceSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createServiceClient<Database>(url, key);
}

export async function requireCespitiAccess(): Promise<CespitiAccess> {
  const supabase = await createClient();
  const serviceSupabase = createServiceSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      serviceSupabase: null,
      member: null,
      isAdmin: false,
      error: NextResponse.json(
        { success: false, message: "Non autenticato" },
        { status: 401 },
      ),
    };
  }

  const member = await getAdminMember();
  const flags = await getDocumentiSegreteriaFlags(supabase);

  if (
    !member ||
    !canAccessDocumentiSubsection(member.roles, "libro_cespiti", flags)
  ) {
    return {
      supabase,
      serviceSupabase: null,
      member: null,
      isAdmin: false,
      error: NextResponse.json(
        { success: false, message: "Non autorizzato" },
        { status: 403 },
      ),
    };
  }

  if (!serviceSupabase) {
    return {
      supabase,
      serviceSupabase: null,
      member: null,
      isAdmin: false,
      error: NextResponse.json(
        {
          success: false,
          message: "Configurazione server incompleta (service role).",
        },
        { status: 500 },
      ),
    };
  }

  return {
    supabase,
    serviceSupabase,
    member,
    isAdmin: member.roles.includes(MemberRole.Admin),
    error: null,
  };
}

export async function signedPhotoUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) return null;

  const { data: signed, error } = await supabase.storage
    .from(CESPITI_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (!error && signed?.signedUrl) return signed.signedUrl;

  const { data: publicData } = supabase.storage
    .from(CESPITI_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return publicData.publicUrl || null;
}

export async function withPhotoUrls<T extends { photoStoragePath: string | null }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assets: T[],
): Promise<(T & { photoUrl: string | null })[]> {
  return Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      photoUrl: await signedPhotoUrl(supabase, asset.photoStoragePath),
    })),
  );
}
