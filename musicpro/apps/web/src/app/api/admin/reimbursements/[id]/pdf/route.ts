import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getReimbursementById,
  isExternalPdfUrl,
  updateReimbursementPdf,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { canManageReimbursements } from "@/lib/admin/roles";
import { toNotulaPdfInput } from "@/lib/reimbursements/notula";
import { generateReimbursementPdf } from "@/lib/reimbursements/pdf";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "reimbursements";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
  const { data: signed, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (!error && signed?.signedUrl) return signed.signedUrl;

  const { data: publicData } = supabase.storage
    .from(STORAGE_BUCKET)
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
      source: "legacy",
    });
  }

  if (reimbursement.pdfStoragePath) {
    const pdfUrl = await signedStorageUrl(supabase, reimbursement.pdfStoragePath);
    if (pdfUrl) {
      return NextResponse.json({
        success: true,
        id,
        pdfUrl,
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

  if (isExternalPdfUrl(reimbursement.pdfUrl)) {
    return NextResponse.json({
      success: true,
      id,
      pdfUrl: reimbursement.pdfUrl,
      source: "legacy",
    });
  }

  const input = await toNotulaPdfInput(supabase, reimbursement);
  const pdf = await generateReimbursementPdf(input);
  const storagePath = `${reimbursement.fiscalYear}/${reimbursement.memberId}/${pdf.filename}`;

  let pdfUrl: string | null = null;
  let pdfStoragePath: string | null = null;
  let storageSkipped = false;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, pdf.bytes, {
      contentType: pdf.contentType,
      upsert: true,
    });

  if (uploadError) {
    storageSkipped = true;
    const base64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(pdf.bytes).toString("base64")
        : "";
    pdfUrl = base64 ? `data:application/pdf;base64,${base64}` : null;
  } else {
    pdfStoragePath = storagePath;
    pdfUrl = await signedStorageUrl(supabase, storagePath);
    await updateReimbursementPdf(supabase, id, {
      pdfUrl: null,
      pdfStoragePath,
    });
  }

  return NextResponse.json({
    success: true,
    id,
    pdfUrl,
    pdfStoragePath,
    storageSkipped,
    filename: pdf.filename,
    pdfBase64:
      typeof Buffer !== "undefined"
        ? Buffer.from(pdf.bytes).toString("base64")
        : undefined,
  });
}
