import { NextResponse } from "next/server";

import {
  findDuplicateMatches,
  getFixedAssetById,
  mergeQuantities,
} from "@musicpro/database";

import { requireCespitiAccess } from "@/lib/admin/cespiti-auth";

interface PostBody {
  targetId?: string;
  sourceId?: string;
}

export async function POST(request: Request) {
  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  if (!body.targetId || !body.sourceId) {
    return NextResponse.json(
      { success: false, message: "ID target e sorgente obbligatori." },
      { status: 400 },
    );
  }

  const [target, source] = await Promise.all([
    getFixedAssetById(access.supabase, body.targetId),
    getFixedAssetById(access.supabase, body.sourceId),
  ]);

  if (!target || !source) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato." },
      { status: 404 },
    );
  }

  if (source.deletedAt) {
    return NextResponse.json(
      { success: false, message: "Il cespite sorgente è già eliminato." },
      { status: 400 },
    );
  }

  const duplicates = await findDuplicateMatches(access.supabase, source);
  const isCompatible = duplicates.some((match) => match.asset.id === target.id);
  if (!isCompatible) {
    return NextResponse.json(
      {
        success: false,
        message: "I cespiti selezionati non sono duplicati compatibili per l'unione.",
      },
      { status: 400 },
    );
  }

  const result = await mergeQuantities(
    access.supabase,
    body.targetId,
    body.sourceId,
    access.member.id,
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, message: result.errorMessage ?? "Unione non riuscita." },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, id: result.id });
}
