import { NextResponse } from "next/server";

import { MemberRole, type MemberWithRoles } from "@musicpro/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiSubsection,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { createClient } from "@/lib/supabase/server";

export const CESPITI_STORAGE_BUCKET = "fixed_assets";

export type CespitiAccess =
  | {
      supabase: SupabaseClient;
      member: MemberWithRoles;
      isAdmin: boolean;
      error: null;
    }
  | {
      supabase: SupabaseClient;
      member: null;
      isAdmin: false;
      error: NextResponse;
    };

export async function requireCespitiAccess(): Promise<CespitiAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
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
      member: null,
      isAdmin: false,
      error: NextResponse.json(
        { success: false, message: "Non autorizzato" },
        { status: 403 },
      ),
    };
  }

  return {
    supabase,
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
