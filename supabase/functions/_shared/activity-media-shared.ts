import { S3Client } from 'npm:@aws-sdk/client-s3';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export interface ActivityMediaTransform {
  trim?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
}

export interface R2Config {
  accountId: string;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getR2Config(): R2Config {
  const accountId = Deno.env.get('CF_ACCOUNT_ID') ?? '';
  const bucket = Deno.env.get('CF_R2_BUCKET') ?? '';
  const endpoint = Deno.env.get('CF_R2_S3_ENDPOINT') ?? '';
  const accessKeyId = Deno.env.get('CF_R2_ACCESS_KEY_ID') ?? '';
  const secretAccessKey = Deno.env.get('CF_R2_SECRET_ACCESS_KEY') ?? '';
  const publicBaseUrl = (Deno.env.get('CF_MEDIA_PUBLIC_BASE_URL') ?? 'https://media.lub.org.in').replace(/\/$/, '');

  if (!accountId || !bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 secrets are not configured.');
  }

  return {
    accountId,
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

export function getR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function resolveSessionUserId(
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionToken: string
): Promise<string | null> {
  const result = await rpcCall<string | null>(
    supabaseUrl,
    serviceRoleKey,
    'resolve_custom_session_user_id',
    { p_session_token: sessionToken }
  );
  return result ?? null;
}

export async function hasPermission(
  supabaseUrl: string,
  serviceRoleKey: string,
  actorId: string,
  code: string
): Promise<boolean> {
  const result = await rpcCall<boolean | null>(
    supabaseUrl,
    serviceRoleKey,
    'has_permission',
    { p_user_id: actorId, p_permission_code: code }
  );
  return Boolean(result);
}

interface ActivityAccessRow {
  created_by: string | null;
}

export async function canAccessActivityMedia(
  supabaseUrl: string,
  serviceRoleKey: string,
  actorId: string,
  activityId: string
): Promise<boolean> {
  if (await hasPermission(supabaseUrl, serviceRoleKey, actorId, 'activities.edit_any')) {
    return true;
  }

  const rows = await restSelect<ActivityAccessRow>(
    supabaseUrl,
    serviceRoleKey,
    `activities?id=eq.${encodeURIComponent(activityId)}&select=created_by&limit=1`
  );
  if (!rows || rows.length === 0) {
    return false;
  }
  return rows[0].created_by === actorId;
}

export async function canDownloadActivityOriginal(
  supabaseUrl: string,
  serviceRoleKey: string,
  actorId: string,
  activityId: string
): Promise<boolean> {
  if (!(await hasPermission(supabaseUrl, serviceRoleKey, actorId, 'activities.view'))) {
    return false;
  }
  return canAccessActivityMedia(supabaseUrl, serviceRoleKey, actorId, activityId);
}

export async function rpcCall<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  params: Record<string, unknown>
): Promise<T | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    console.warn(`[activity-media] rpcCall ${fnName} failed: ${response.status} ${await response.text()}`);
    return null;
  }

  return (await response.json()) as T;
}

export async function restSelect<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  pathAndQuery: string
): Promise<T[] | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    console.warn(`[activity-media] restSelect ${pathAndQuery} failed: ${response.status} ${await response.text()}`);
    return null;
  }

  return (await response.json()) as T[];
}

export function sanitizeFilename(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function guessExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;

  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
    case 'image/jpg':
    default:
      return 'jpg';
  }
}

export function buildActivityObjectKey(
  activityId: string,
  mediaKind: 'cover' | 'gallery',
  originalFileName: string,
  mimeType: string
): string {
  const ext = guessExtension(originalFileName, mimeType);
  return `activities/originals/${mediaKind}/${activityId}/${crypto.randomUUID()}.${ext}`;
}

export function normalizeTransform(raw: string | null): ActivityMediaTransform | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActivityMediaTransform;
    const trim = parsed?.trim;
    if (!trim) return null;
    const left = Math.max(0, Math.round(Number(trim.left)));
    const top = Math.max(0, Math.round(Number(trim.top)));
    const width = Math.max(1, Math.round(Number(trim.width)));
    const height = Math.max(1, Math.round(Number(trim.height)));
    return { trim: { left, top, width, height } };
  } catch {
    return null;
  }
}

export function buildDisplaySeedUrl(
  publicBaseUrl: string,
  mediaKind: 'cover' | 'gallery',
  objectKey: string,
  transform: ActivityMediaTransform | null
): string {
  const url = new URL(`${publicBaseUrl}/v1/activities/${mediaKind}/${encodeURIComponent(objectKey)}`);
  if (transform?.trim) {
    url.searchParams.set('trim.left', String(transform.trim.left));
    url.searchParams.set('trim.top', String(transform.trim.top));
    url.searchParams.set('trim.width', String(transform.trim.width));
    url.searchParams.set('trim.height', String(transform.trim.height));
  }
  return url.toString();
}

export function isObjectKeyOwnedByActivity(objectKey: string, activityId: string): boolean {
  return objectKey.startsWith(`activities/originals/cover/${activityId}/`) ||
    objectKey.startsWith(`activities/originals/gallery/${activityId}/`);
}

export async function putActivityOriginal(
  client: S3Client,
  config: R2Config,
  objectKey: string,
  file: File
): Promise<void> {
  const body = new Uint8Array(await file.arrayBuffer());
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Body: body,
    ContentType: file.type || 'application/octet-stream',
    Metadata: {
      originalfilename: sanitizeFilename(file.name || 'upload'),
    },
  }));
}

export async function deleteActivityOriginal(
  client: S3Client,
  config: R2Config,
  objectKey: string
): Promise<void> {
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
  }));
}

export async function createOriginalDownloadUrl(
  client: S3Client,
  config: R2Config,
  objectKey: string,
  fileName: string | null
): Promise<string> {
  return await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ResponseContentDisposition: fileName
        ? `attachment; filename="${sanitizeFilename(fileName)}"`
        : undefined,
    }),
    { expiresIn: 900 }
  );
}
