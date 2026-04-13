import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const envFilePath = path.join(projectRoot, '.env');
const storageMigrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql'
);

const requiredClientEnv = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

const failures = [];
const warnings = [];
const passes = [];

function parseEnvFile(content) {
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

async function loadLocalEnvFile() {
  try {
    const raw = await fs.readFile(envFilePath, 'utf8');
    return parseEnvFile(raw);
  } catch (error) {
    warnings.push(`.env file not found at ${envFilePath}; checking process env only.`);
    return {};
  }
}

function getEnvValue(key, localEnv) {
  return (process.env[key] || localEnv[key] || '').trim();
}

function recordRequiredClientEnv(localEnv) {
  for (const key of requiredClientEnv) {
    const value = getEnvValue(key, localEnv);
    if (!value) {
      failures.push(`Missing required env var: ${key}`);
    } else {
      passes.push(`${key} is present`);
    }
  }
}

function validateSupabaseUrl(localEnv) {
  const url = getEnvValue('VITE_SUPABASE_URL', localEnv);
  if (!url) {
    return;
  }

  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      failures.push('VITE_SUPABASE_URL must start with http:// or https://');
      return;
    }
    passes.push('VITE_SUPABASE_URL is a valid URL');
  } catch {
    failures.push('VITE_SUPABASE_URL is not a valid URL');
  }
}

function validateAnonKeyShape(localEnv) {
  const anonKey = getEnvValue('VITE_SUPABASE_ANON_KEY', localEnv);
  if (!anonKey) {
    return;
  }

  const jwtParts = anonKey.split('.');
  if (jwtParts.length !== 3) {
    warnings.push(
      'VITE_SUPABASE_ANON_KEY does not look like a JWT token. Verify the value if auth requests fail.'
    );
    return;
  }

  passes.push('VITE_SUPABASE_ANON_KEY format looks valid');
}

function validateEdgeEmailEnv(localEnv) {
  const resendFrom = getEnvValue('RESEND_FROM_ADDRESS', localEnv);
  const resendApiKey = getEnvValue('RESEND_API_KEY', localEnv);

  if (!resendFrom) {
    warnings.push(
      'RESEND_FROM_ADDRESS is not set locally. Ensure it is configured in Supabase Edge function secrets.'
    );
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resendFrom)) {
    failures.push('RESEND_FROM_ADDRESS is present but not a valid email address.');
  } else {
    passes.push('RESEND_FROM_ADDRESS format looks valid');
  }

  if (!resendApiKey) {
    warnings.push(
      'RESEND_API_KEY is not set locally. Ensure it is configured in Supabase Edge function secrets.'
    );
  } else {
    passes.push('RESEND_API_KEY is present locally');
  }
}

async function validateMigrationFilePresence() {
  try {
    await fs.access(storageMigrationPath);
    passes.push('Storage bucket migration file is present in repo');
  } catch {
    failures.push(`Missing storage migration file: ${storageMigrationPath}`);
  }
}

async function validateStorageBuckets(localEnv) {
  const url = getEnvValue('VITE_SUPABASE_URL', localEnv);
  const serviceRoleKey =
    getEnvValue('SUPABASE_SERVICE_ROLE_KEY', localEnv) ||
    getEnvValue('VITE_SUPABASE_SERVICE_ROLE_KEY', localEnv);

  if (!url) {
    warnings.push('Storage bucket verification skipped because VITE_SUPABASE_URL is missing.');
    return;
  }

  if (!serviceRoleKey) {
    warnings.push(
      'Storage bucket verification skipped because SUPABASE_SERVICE_ROLE_KEY is missing (read-only local check still completed).'
    );
    return;
  }

  const endpoint = `${url.replace(/\/+$/, '')}/storage/v1/bucket`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      warnings.push(
        `Storage bucket verification request returned ${response.status}. Verify service-role key scope and project URL.`
      );
      return;
    }

    const buckets = await response.json();
    if (!Array.isArray(buckets)) {
      warnings.push('Storage bucket verification returned unexpected payload.');
      return;
    }

    const bucketIds = new Set(buckets.map((bucket) => bucket?.id).filter(Boolean));
    const requiredBuckets = ['public-files', 'member-photos'];
    const missingBuckets = requiredBuckets.filter((bucketId) => !bucketIds.has(bucketId));

    if (missingBuckets.length > 0) {
      failures.push(
        `Missing storage buckets in connected Supabase project: ${missingBuckets.join(', ')}`
      );
    } else {
      passes.push('Required storage buckets exist in connected Supabase project');
    }
  } catch (error) {
    warnings.push(
      `Storage bucket verification failed due to a network/runtime error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function printSummary() {
  console.log('\nRuntime/Env Verification Summary');
  console.log('================================');

  if (passes.length > 0) {
    console.log('\nPASS');
    for (const item of passes) {
      console.log(`- ${item}`);
    }
  }

  if (warnings.length > 0) {
    console.log('\nWARN');
    for (const item of warnings) {
      console.log(`- ${item}`);
    }
  }

  if (failures.length > 0) {
    console.log('\nFAIL');
    for (const item of failures) {
      console.log(`- ${item}`);
    }
  }

  console.log('\nRecommended Next Commands');
  console.log('- npm run build');
  console.log('- npm run lint');
  console.log('- npm run test:e2e:phase1:local');
  console.log('\nFor Supabase Edge secrets, confirm: RESEND_API_KEY and RESEND_FROM_ADDRESS');
}

async function main() {
  const localEnv = await loadLocalEnvFile();

  recordRequiredClientEnv(localEnv);
  validateSupabaseUrl(localEnv);
  validateAnonKeyShape(localEnv);
  validateEdgeEmailEnv(localEnv);
  await validateMigrationFilePresence();
  await validateStorageBuckets(localEnv);

  printSummary();

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
