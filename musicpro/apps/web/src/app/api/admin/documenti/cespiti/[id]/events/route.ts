import { NextResponse } from "next/server";

import {
  addFixedAssetEvent,
  getFixedAssetById,
  listFixedAssetEvents,
  type FixedAssetEventInput,
} from "@musicpro/database";

import { requireCespitiAccess } from "@/lib/admin/cespiti-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  const asset = await getFixedAssetById(access.supabase, id);
  if (!asset) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato" },
      { status: 404 },
    );
  }

  try {
    const events = await listFixedAssetEvents(access.supabase, id);
    return NextResponse.json({ success: true, events });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Impossibile caricare gli eventi.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  let body: FixedAssetEventInput;
  try {
    body = (await request.json()) as FixedAssetEventInput;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const result = await addFixedAssetEvent(access.supabase, id, {
    ...body,
    createdBy: access.member.id,
  });

  if (!result.success || !result.id) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage ?? "Impossibile registrare l'evento.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, id: result.id, assetId: id });
}
