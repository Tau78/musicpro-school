import {
  getAppSettingValue,
  reimbursementAssociateFolder,
  reimbursementPdfFilename,
  reimbursementStoragePath,
  reimbursementYearFolder,
  updateReimbursementPdf,
  type Database,
  type ReimbursementDisplay,
} from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbClient = SupabaseClient<Database>;

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { uploadReimbursementPdfToDrive } from "./google-drive";
import { toNotulaPdfInput } from "./notula";
import { generateReimbursementPdf } from "./pdf";

export const REIMBURSEMENTS_STORAGE_BUCKET = "reimbursements";

export type PersistReimbursementPdfResult = {
  success: boolean;
  id: string;
  filename: string;
  pdfBase64: string;
  pdfUrl: string | null;
  pdfStoragePath: string | null;
  driveUrl: string | null;
  storageSkipped: boolean;
  storageError?: string;
  driveError?: string;
  message?: string;
};

function tryServiceRole() {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

async function ensureReimbursementsBucket(
  storageClient: DbClient,
): Promise<string | null> {
  const { data: buckets, error: listError } = await storageClient.storage.listBuckets();
  if (listError) return listError.message;

  if ((buckets ?? []).some((bucket) => bucket.id === REIMBURSEMENTS_STORAGE_BUCKET)) {
    return null;
  }

  const { error } = await storageClient.storage.createBucket(
    REIMBURSEMENTS_STORAGE_BUCKET,
    {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf"],
    },
  );
  if (error && !/already exists/i.test(error.message)) {
    return error.message;
  }
  return null;
}

async function signedStorageUrl(
  storageClient: DbClient,
  storagePath: string,
): Promise<string | null> {
  const { data: signed, error } = await storageClient.storage
    .from(REIMBURSEMENTS_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (!error && signed?.signedUrl) return signed.signedUrl;

  const { data: publicData } = storageClient.storage
    .from(REIMBURSEMENTS_STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  return publicData.publicUrl || null;
}

export async function persistReimbursementPdf(
  userClient: DbClient,
  reimbursement: ReimbursementDisplay,
): Promise<PersistReimbursementPdfResult> {
  const service = tryServiceRole();
  const storageClient = service ?? userClient;
  const dbClient = service ?? userClient;

  const input = await toNotulaPdfInput(userClient, reimbursement);
  const pdf = await generateReimbursementPdf(input);
  const filename = reimbursementPdfFilename({
    progressive: reimbursement.progressive,
    fiscalYear: reimbursement.fiscalYear,
    associateName: reimbursement.associateName,
  });
  const storagePath = reimbursementStoragePath({
    progressive: reimbursement.progressive,
    fiscalYear: reimbursement.fiscalYear,
    associateName: reimbursement.associateName,
  });
  const pdfBase64 = Buffer.from(pdf.bytes).toString("base64");

  const bucketError = await ensureReimbursementsBucket(storageClient);
  let storageError: string | undefined = bucketError ?? undefined;
  let pdfStoragePath: string | null = null;

  if (!storageError) {
    const { error: uploadError } = await storageClient.storage
      .from(REIMBURSEMENTS_STORAGE_BUCKET)
      .upload(storagePath, pdf.bytes, {
        contentType: pdf.contentType,
        upsert: true,
      });
    if (uploadError) {
      storageError = uploadError.message;
    } else {
      pdfStoragePath = storagePath;
    }
  }

  let driveUrl: string | null = null;
  let driveError: string | undefined;
  try {
    const rootFolderId = await getAppSettingValue(
      dbClient,
      "root_reimbursements_folder_id",
    );
    if (!rootFolderId) {
      driveError = "root_reimbursements_folder_id non configurato";
    } else {
      const drive = await uploadReimbursementPdfToDrive({
        rootFolderId,
        yearFolderName: reimbursementYearFolder(reimbursement.fiscalYear),
        associateFolderName: reimbursementAssociateFolder(
          reimbursement.associateName,
        ),
        filename,
        bytes: pdf.bytes,
      });
      if (drive.ok) {
        driveUrl = drive.webViewLink;
      } else {
        driveError = drive.error;
      }
    }
  } catch (err) {
    driveError = err instanceof Error ? err.message : "Upload Drive fallito";
  }

  const signedUrl = pdfStoragePath
    ? await signedStorageUrl(storageClient, pdfStoragePath)
    : null;
  const pdfUrl = driveUrl || signedUrl;

  if (pdfStoragePath || driveUrl) {
    await updateReimbursementPdf(dbClient, reimbursement.id, {
      pdfUrl: driveUrl,
      pdfStoragePath,
    });
  }

  const success = Boolean(pdfStoragePath || driveUrl);
  const warnings = [storageError, driveError].filter(Boolean);
  return {
    success,
    id: reimbursement.id,
    filename,
    pdfBase64,
    pdfUrl,
    pdfStoragePath,
    driveUrl,
    storageSkipped: !pdfStoragePath,
    storageError,
    driveError,
    message: success
      ? warnings.length
        ? `PDF generato con avvisi: ${warnings.join(" · ")}`
        : "PDF generato"
      : `PDF non salvato: ${warnings.join(" · ") || "errore sconosciuto"}`,
  };
}
