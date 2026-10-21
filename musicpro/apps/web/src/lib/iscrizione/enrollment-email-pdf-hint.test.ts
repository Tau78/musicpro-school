import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enrollmentPdfEmailBodyHint,
  isGoogleDriveFileUrl,
} from "./enrollment-email-pdf-hint.ts";

const DRIVE =
  "https://drive.google.com/file/d/1QKxgBgS6ey8MRkBpq3a2Tm6vhFQXuzqW/view?usp=drivesdk";
const STORAGE =
  "https://xyz.supabase.co/storage/v1/object/sign/enrollments/x.pdf?token=abc";

test("isGoogleDriveFileUrl riconosce webViewLink Drive", () => {
  assert.equal(isGoogleDriveFileUrl(DRIVE), true);
  assert.equal(isGoogleDriveFileUrl(STORAGE), false);
  assert.equal(
    isGoogleDriveFileUrl("https://drive.google.com/open?id=abc"),
    true,
  );
});

test("admin: niente link Drive nel body (evita chip Gmail doppio)", () => {
  assert.equal(
    enrollmentPdfEmailBodyHint({
      pdfUrl: DRIVE,
      storagePath: "enrollments/abc.pdf",
      role: "admin",
    }),
    "PDF allegato (path interno: enrollments/abc.pdf).",
  );
  assert.equal(
    enrollmentPdfEmailBodyHint({
      pdfUrl: DRIVE,
      role: "admin",
    }),
    "PDF in allegato.",
  );
});

test("admin/socio: preferiscono URL Storage a Drive", () => {
  assert.equal(
    enrollmentPdfEmailBodyHint({
      pdfUrl: DRIVE,
      storagePdfUrl: STORAGE,
      role: "admin",
    }),
    `PDF: ${STORAGE}`,
  );
  assert.equal(
    enrollmentPdfEmailBodyHint({
      pdfUrl: DRIVE,
      storagePdfUrl: STORAGE,
      role: "socio",
    }),
    `\nCopia online:\n${STORAGE}\n`,
  );
});

test("socio: senza URL non-Drive non aggiunge Copia online", () => {
  assert.equal(
    enrollmentPdfEmailBodyHint({
      pdfUrl: DRIVE,
      role: "socio",
    }),
    "",
  );
});
