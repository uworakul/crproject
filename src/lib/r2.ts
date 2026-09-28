import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Employee/ID-card photo uploads (2026-09-26) — files are uploaded into a
// single Cloudflare R2 bucket (shared across every tenant/customer — this
// app is multi-tenant, one DB per tenant, but one R2 bucket for all of
// them) using an S3-compatible API access key pair the user creates in the
// Cloudflare dashboard. R2 has no folder concept the way Google Drive does
// (it was replaced from Drive on this date) — "folders" are just slashes in
// the object key. The caller (GET/POST /api/employees/[empCode]/photo)
// prefixes every key with the current tenant's code ("001"/"002", from
// CurrentUser.tenantCode) so files from different tenants never mix in the
// bucket (2026-09-28, requested by the user) — this module itself stays
// tenant-agnostic, just storing/serving whatever key it's given.
//
// Uses the official @aws-sdk/client-s3 rather than hand-rolled fetch + AWS
// Signature V4 signing — R2 is S3-API-compatible, and re-implementing SigV4
// ourselves would be a security-sensitive thing to get subtly wrong. This
// mirrors the earlier Drive integration's choice of google-auth-library over
// raw signing: use the well-tested official client for the auth-critical
// part, keep everything else (upload/delete/download orchestration) simple.
//
// Security: uploaded files are NEVER made public — these are employee photos
// and Thai national ID card photos (PII, same category the project already
// treats carefully elsewhere, e.g. worksheet.xlsx). The bucket stays private;
// mst_employee.PhotoPath/IDCardPhotoPath store the R2 object key only, and
// the app serves the image bytes itself through an authenticated proxy route
// (GET /api/employees/[empCode]/photo) that re-checks EMPLOYEE read
// permission on every request — never a public/presigned URL.

export class R2NotConfiguredError extends Error {
  constructor() {
    super(
      "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must all be set in .env — Cloudflare R2 upload is not configured"
    );
    this.name = "R2NotConfiguredError";
  }
}

let cachedClient: S3Client | null = null;
let cachedBucket: string | null = null;

function getClient(): { client: S3Client; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new R2NotConfiguredError();

  if (cachedClient && cachedBucket === bucket) return { client: cachedClient, bucket };

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  cachedBucket = bucket;
  return { client: cachedClient, bucket };
}

export interface UploadedR2File {
  key: string;
}

// Uploads a single object under whatever key the caller passes in (tenant
// code prefix, see the photo route) — no per-tenant R2 configuration needed
// (unlike the old Drive folder ID that had to be pasted into System
// Configuration).
export async function uploadFileToR2(key: string, mimeType: string, data: Buffer): Promise<UploadedR2File> {
  const { client, bucket } = getClient();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: mimeType }));
  return { key };
}

// Deletes the previous file (best-effort — replacing a photo shouldn't leave
// the old one orphaned in the bucket) — swallows errors so a failed delete of
// the OLD file never blocks the NEW upload from being saved.
export async function deleteFileFromR2(key: string): Promise<void> {
  try {
    const { client, bucket } = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // best-effort only
  }
}

export interface R2FileContent {
  data: Buffer;
  mimeType: string;
}

export async function downloadFileFromR2(key: string): Promise<R2FileContent> {
  const { client, bucket } = getClient();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Buffer[] = [];
  // @ts-expect-error - Body is a Node.js Readable stream in the Node runtime
  for await (const chunk of res.Body) chunks.push(Buffer.from(chunk));
  return { data: Buffer.concat(chunks), mimeType: res.ContentType ?? "application/octet-stream" };
}
