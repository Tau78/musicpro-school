import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type DriveUploadResult =
  | { ok: true; fileId: string; webViewLink: string }
  | { ok: false; error: string };

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function loadServiceAccount(): GoogleServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  let json = raw;
  if (!raw.startsWith("{")) {
    const filePath = resolve(raw);
    if (!existsSync(filePath)) return null;
    json = readFileSync(filePath, "utf8");
  }

  try {
    const parsed = JSON.parse(json) as GoogleServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      ...parsed,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function actAsEmail(): string | null {
  return (
    process.env.GOOGLE_DRIVE_ACT_AS_EMAIL?.trim() ||
    process.env.GOOGLE_CALENDAR_ACT_AS_EMAIL?.trim() ||
    null
  );
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function getDriveAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  if (!sa) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON assente o non valido");
  }

  const now = Math.floor(Date.now() / 1000);
  const subject = actAsEmail();
  const unsigned = `${base64UrlJson({ alg: "RS256", typ: "JWT" })}.${base64UrlJson({
    iss: sa.client_email,
    scope: DRIVE_SCOPE,
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    ...(subject ? { sub: subject } : {}),
  })}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(sa.private_key, "base64url")}`;

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const detail = [data.error, data.error_description].filter(Boolean).join(": ");
    throw new Error(detail || `Token Google Drive fallito (${res.status})`);
  }
  return data.access_token;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson<T>(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Google Drive ${res.status}`);
  }
  return data;
}

async function findChild(
  token: string,
  parentId: string,
  name: string,
  mimeType?: string,
): Promise<{ id: string; webViewLink?: string } | null> {
  const clauses = [
    `'${parentId}' in parents`,
    `name = '${escapeDriveQuery(name)}'`,
    "trashed = false",
  ];
  if (mimeType) clauses.push(`mimeType = '${mimeType}'`);
  const q = encodeURIComponent(clauses.join(" and "));
  const data = await driveJson<{
    files?: Array<{ id: string; webViewLink?: string }>;
  }>(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,webViewLink)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
  );
  return data.files?.[0] ?? null;
}

async function getOrCreateFolder(
  token: string,
  parentId: string,
  name: string,
): Promise<string> {
  const existing = await findChild(token, parentId, name, FOLDER_MIME);
  if (existing?.id) return existing.id;

  const created = await driveJson<{ id: string }>(
    token,
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      }),
    },
  );
  return created.id;
}

async function folderAccessible(token: string, folderId: string): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.ok;
}

async function findFolderByName(
  token: string,
  name: string,
): Promise<string | null> {
  const q = encodeURIComponent(
    `name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
  );
  const data = await driveJson<{ files?: Array<{ id: string }> }>(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
  );
  return data.files?.[0]?.id ?? null;
}

function shareHint(): string {
  const email = loadServiceAccount()?.client_email;
  return email
    ? `Condividi la cartella Drive «Rimborsi {anno}» (o la root notule) con ${email} come Editor.`
    : "Condividi la cartella Drive «Rimborsi {anno}» con il service account Google.";
}

async function resolveYearFolder(
  token: string,
  rootFolderId: string,
  yearFolderName: string,
): Promise<string> {
  if (await folderAccessible(token, rootFolderId)) {
    return getOrCreateFolder(token, rootFolderId, yearFolderName);
  }

  const byName = await findFolderByName(token, yearFolderName);
  if (byName) return byName;

  throw new Error(
    `Cartella Drive «${yearFolderName}» non accessibile. ${shareHint()}`,
  );
}

async function uploadPdfFile(
  token: string,
  parentId: string,
  filename: string,
  bytes: Uint8Array,
): Promise<{ id: string; webViewLink: string }> {
  const existing = await findChild(token, parentId, filename);
  const boundary = `musicpro_${Date.now()}`;
  const metadata: Record<string, unknown> = { name: filename };
  if (!existing) metadata.parents = [parentId];

  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, Buffer.from(bytes), suffix]);

  const endpoint = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink";

  const res = await fetch(endpoint, {
    method: existing ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    webViewLink?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || `Upload Drive fallito (${res.status})`);
  }
  return {
    id: data.id,
    webViewLink:
      data.webViewLink ||
      `https://drive.google.com/file/d/${data.id}/view`,
  };
}

export async function uploadReimbursementPdfToDrive(params: {
  rootFolderId: string;
  yearFolderName: string;
  associateFolderName: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<DriveUploadResult> {
  try {
    const token = await getDriveAccessToken();
    const yearFolderId = await resolveYearFolder(
      token,
      params.rootFolderId,
      params.yearFolderName,
    );
    const associateFolderId = await getOrCreateFolder(
      token,
      yearFolderId,
      params.associateFolderName,
    );
    const file = await uploadPdfFile(
      token,
      associateFolderId,
      params.filename,
      params.bytes,
    );
    return { ok: true, fileId: file.id, webViewLink: file.webViewLink };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload Drive fallito",
    };
  }
}
