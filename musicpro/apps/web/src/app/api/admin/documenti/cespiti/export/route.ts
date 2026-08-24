import { NextResponse } from "next/server";

import { listFixedAssets } from "@musicpro/database";

import { requireCespitiAccess } from "@/lib/admin/cespiti-auth";
import {
  buildCespitiBookHtml,
  buildCespitiCsv,
} from "@/lib/documenti/cespiti-book-html";

export async function GET(request: Request) {
  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  const format = new URL(request.url).searchParams.get("format") ?? "html";

  try {
    const assets = await listFixedAssets(access.supabase, {
      includeDeleted: false,
      includeDisposed: false,
    });

    if (format === "csv") {
      const csv = buildCespitiCsv(assets);
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="libro-cespiti-${stamp}.csv"`,
        },
      });
    }

    if (format === "html") {
      const html = buildCespitiBookHtml(assets);
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    return NextResponse.json(
      { success: false, message: "Formato non valido (html o csv)" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Impossibile esportare i cespiti.",
      },
      { status: 500 },
    );
  }
}
