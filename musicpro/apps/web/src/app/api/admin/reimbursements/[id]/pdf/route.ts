import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getMemberById,
  getReimbursementById,
  updateReimbursementPdf,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { canManageReimbursements } from "@/lib/admin/roles";
import { generateReimbursementPdf } from "@/lib/reimbursements/pdf";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "reimbursements";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function memberAddress(member: {
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressProvince: string | null;
}): string {
  const parts = [
    member.addressStreet,
    [member.addressPostalCode, member.addressCity].filter(Boolean).join(" "),
    member.addressProvince ? `(${member.addressProvince})` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Non autenticato" },
      { status: 401 },
    );
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageReimbursements(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
    );
  }

  const isDocenteOnly =
    currentMember.roles.includes(MemberRole.Docente) &&
    !currentMember.roles.includes(MemberRole.Admin);

  const reimbursement = await getReimbursementById(supabase, id);
  if (!reimbursement) {
    return NextResponse.json(
      { success: false, message: "Rimborso non trovato" },
      { status: 404 },
    );
  }

  if (isDocenteOnly && reimbursement.memberId !== currentMember.id) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
    );
  }

  const member = await getMemberById(supabase, reimbursement.memberId);

  const pdf = await generateReimbursementPdf({
    progressive: reimbursement.progressive,
    fiscalYear: reimbursement.fiscalYear,
    associateName: reimbursement.associateName,
    address: member ? memberAddress(member) : null,
    taxCode: member?.taxCode ?? null,
    grossAmountEur: reimbursement.grossAmountEur,
    paymentMethod: reimbursement.paymentMethod,
    paymentDate: reimbursement.paymentDate,
    receiptsAmountEur: reimbursement.receiptsAmountEur,
    generatedAt: reimbursement.generatedAt,
  });

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
    // Fallback: data URL so the list can still open the document client-side
    // after a subsequent fetch of this endpoint returns bytes, or printable HTML.
    const base64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(pdf.bytes).toString("base64")
        : "";
    pdfUrl = base64
      ? `data:application/pdf;base64,${base64}`
      : null;
  } else {
    pdfStoragePath = storagePath;
    const { data: publicData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    pdfUrl = publicData.publicUrl;

    // Prefer signed URL if bucket is private
    const { data: signed, error: signedError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    if (!signedError && signed?.signedUrl) {
      pdfUrl = signed.signedUrl;
    }
  }

  // Avoid storing huge data URLs in DB if fallback used
  const persistedUrl =
    pdfUrl && pdfUrl.startsWith("data:") ? null : pdfUrl;

  if (persistedUrl || pdfStoragePath) {
    await updateReimbursementPdf(supabase, id, {
      pdfUrl: persistedUrl,
      pdfStoragePath,
    });
  }

  return NextResponse.json({
    success: true,
    id,
    pdfUrl: persistedUrl ?? pdfUrl,
    pdfStoragePath,
    storageSkipped,
    filename: pdf.filename,
    // Return base64 so client can open/download even without Storage
    pdfBase64:
      typeof Buffer !== "undefined"
        ? Buffer.from(pdf.bytes).toString("base64")
        : undefined,
  });
}
