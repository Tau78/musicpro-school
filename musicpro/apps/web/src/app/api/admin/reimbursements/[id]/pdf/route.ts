import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getReimbursementById,
  isExternalPdfUrl,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { canManageReimbursements } from "@/lib/admin/roles";
import {
  persistReimbursementPdf,
  REIMBURSEMENTS_STORAGE_BUCKET,
} from "@/lib/reimbursements/persist";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function tryServiceRole() {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

async function authorize(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { success: false, message: "Non autenticato" },
        { status: 401 },
      ),
    };
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageReimbursements(currentMember.roles)) {
    return {
      error: NextResponse.json(
        { success: false, message: "Non autorizzato" },
        { status: 403 },
      ),
    };
  }

  const isDocenteOnly =
    currentMember.roles.includes(MemberRole.Docente) &&
    !currentMember.roles.includes(MemberRole.Admin);

  const reimbursement = await getReimbursementById(supabase, id);
  if (!reimbursement) {
    return {
      error: NextResponse.json(
        { success: false, message: "Rimborso non trovato" },
        { status: 404 },
      ),
    };
  }

  if (isDocenteOnly && reimbursement.memberId !== currentMember.id) {
    return {
      error: NextResponse.json(
        { success: false, message: "Non autorizzato" },
        { status: 403 },
      ),
    };
  }

  return { supabase, reimbursement };
}

async function signedStorageUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
): Promise<string | null> {
  const storageClient = tryServiceRole() ?? supabase;
  const { data: signed, error } = await storageClient.storage
    .from(REIMBURSEMENTS_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (!error && signed?.signedUrl) return signed.signedUrl;

  const { data: publicData } = storageClient.storage
    .from(REIMBURSEMENTS_STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  return publicData.publicUrl || null;
}

/** Open existing Drive / Storage PDF without regenerating. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const auth = await authorize(id);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, reimbursement } = auth;

  if (isExternalPdfUrl(reimbursement.pdfUrl)) {
    return NextResponse.json({
      success: true,
      id,
      pdfUrl: reimbursement.pdfUrl,
      pdfStoragePath: reimbursement.pdfStoragePath,
      source: "drive",
    });
  }

  if (reimbursement.pdfStoragePath) {
    const pdfUrl = await signedStorageUrl(supabase, reimbursement.pdfStoragePath);
    if (pdfUrl) {
      return NextResponse.json({
        success: true,
        id,
        pdfUrl,
        pdfStoragePath: reimbursement.pdfStoragePath,
        source: "storage",
      });
    }
  }

  return NextResponse.json(
    { success: false, message: "PDF non ancora generato", id },
    { status: 404 },
  );
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const auth = await authorize(id);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, reimbursement } = auth;

  if (isExternalPdfUrl(reimbursement.pdfUrl) && reimbursement.pdfStoragePath) {
    return NextResponse.json({
      success: true,
      id,
      pdfUrl: reimbursement.pdfUrl,
      pdfStoragePath: reimbursement.pdfStoragePath,
      source: "drive",
    });
  }

  const persisted = await persistReimbursementPdf(supabase, reimbursement);
  return NextResponse.json(
    {
      ...persisted,
      source: persisted.driveUrl ? "drive" : persisted.pdfStoragePath ? "storage" : "inline",
    },
    { status: persisted.success ? 200 : 502 },
  );
}
