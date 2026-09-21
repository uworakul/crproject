import "server-only";
import { JWT } from "google-auth-library";

// Employee/ID-card photo uploads (2026-09-21) — files are uploaded into a
// single shared Google Drive folder (its ID is sys_config.FileFolder, set by
// the admin via /system-config) using a Google Cloud Service Account that the
// user must create and share that folder with (Editor access) — see the
// setup steps given to the user; there is no way for this codebase to create
// that credential itself.
//
// Deliberately NOT using the full `googleapis` package (181.0.0, bundles
// every Google API client — huge install for one Drive integration) —
// google-auth-library alone handles the service-account JWT/token exchange,
// and the actual Drive v3 calls are plain fetch() against the REST API.
//
// Security: uploaded files are NEVER made "anyone with the link" — these are
// employee photos and Thai national ID card photos (PII, same category the
// project already treats carefully elsewhere, e.g. worksheet.xlsx). Files
// stay private to the service account; mst_employee.PhotoPath/IDCardPhotoPath
// store the Drive file ID only, and the app serves the image bytes itself
// through an authenticated proxy route (GET /api/employees/[empCode]/photo)
// that re-checks EMPLOYEE read permission on every request — never a public
// Drive URL.

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export class DriveNotConfiguredError extends Error {
  constructor() {
    super("GOOGLE_SERVICE_ACCOUNT_KEY is not set — Google Drive upload is not configured");
    this.name = "DriveNotConfiguredError";
  }
}

let cachedClient: JWT | null = null;

function getAuthClient(): JWT {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new DriveNotConfiguredError();
  if (cachedClient) return cachedClient;

  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }

  cachedClient = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return cachedClient;
}

async function getAccessToken(): Promise<string> {
  const client = getAuthClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain a Google Drive access token");
  return token;
}

// sys_config.FileFolder is filled in by hand via /system-config, and the
// natural thing to paste there is whatever Drive's own "Get link" button
// gives you (https://drive.google.com/drive/folders/<ID>?usp=sharing), not
// the bare folder ID the API actually needs — confirmed in practice: the
// user's real value was the full share URL. Accept either form rather than
// requiring the ID to be hand-extracted.
export function parseDriveFolderId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

export interface UploadedDriveFile {
  fileId: string;
}

// Uploads a single file into `folderId` using simple multipart upload
// (metadata + media in one request — fine for photo-sized files, no need for
// resumable upload here). Throws on any non-2xx response with the response
// body's error message included, so callers get a real reason instead of a
// generic failure.
export async function uploadFileToDriveFolder(folderId: string, fileName: string, mimeType: string, data: Buffer): Promise<UploadedDriveFile> {
  const token = await getAccessToken();

  const boundary = `crpayroll-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Drive upload failed: ${json?.error?.message ?? res.statusText}`);
  return { fileId: json.id };
}

// Deletes the previous file (best-effort — replacing a photo shouldn't leave
// the old one orphaned in the shared folder) — swallows errors so a failed
// delete of the OLD file never blocks the NEW upload from being saved.
export async function deleteDriveFile(fileId: string): Promise<void> {
  try {
    const token = await getAccessToken();
    await fetch(`${DRIVE_FILES_URL}/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // best-effort only
  }
}

export interface DriveFileContent {
  data: ArrayBuffer;
  mimeType: string;
}

export async function downloadDriveFile(fileId: string): Promise<DriveFileContent> {
  const token = await getAccessToken();
  const metaRes = await fetch(`${DRIVE_FILES_URL}/${fileId}?fields=mimeType`, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaRes.ok) throw new Error("Could not read file metadata from Google Drive");
  const meta = await metaRes.json();

  const mediaRes = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!mediaRes.ok) throw new Error("Could not download file from Google Drive");
  const data = await mediaRes.arrayBuffer();
  return { data, mimeType: meta.mimeType ?? "application/octet-stream" };
}
