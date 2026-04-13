#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'lub-private', 'supabase-cli.env');
const LOCAL_MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const AUDIT_REPORT_DIR = path.join(ROOT, 'lub-private', 'migration-audit');

function fail(message) {
  console.error(`[supabase-migrations] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.slice(2).split('=', 2);
    out[rawKey] = rawValue ?? 'true';
  }
  return out;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing env file: ${filePath}`);
  }

  const parsed = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
    parsed[key] = value;
  }
  return parsed;
}

function ensureEnv(env) {
  const required = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF'];
  for (const key of required) {
    const value = env[key];
    if (!value || value === '...' || value.includes('...')) {
      fail(`Missing or placeholder value for ${key} in ${ENV_FILE}`);
    }
  }
}

function run(command, args, options = {}) {
  const envFromFile = parseEnvFile(ENV_FILE);
  ensureEnv(envFromFile);

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...envFromFile },
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });

  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`Command failed: ${command} ${args.join(' ')}`);
  }

  return result;
}

function parseMigrationListOutput(output) {
  const remote = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d{14})?\s*\|\s*(\d{14})?\s*\|/);
    if (!match) continue;
    const remoteVersion = match[2];
    if (remoteVersion) remote.add(remoteVersion);
  }
  return remote;
}

function getLocalMigrationVersions() {
  if (!fs.existsSync(LOCAL_MIGRATIONS_DIR)) {
    fail(`Missing local migrations directory: ${LOCAL_MIGRATIONS_DIR}`);
  }
  const local = new Set();
  for (const entry of fs.readdirSync(LOCAL_MIGRATIONS_DIR)) {
    const match = entry.match(/^(\d{14})_.*\.sql$/);
    if (match) local.add(match[1]);
  }
  return local;
}

function toSortedArray(set) {
  return [...set].sort();
}

function setDifference(a, b) {
  const out = new Set();
  for (const value of a) {
    if (!b.has(value)) out.add(value);
  }
  return out;
}

function writeAuditReport(report) {
  fs.mkdirSync(AUDIT_REPORT_DIR, { recursive: true });
  const latestPath = path.join(AUDIT_REPORT_DIR, 'latest.json');
  const stampedPath = path.join(AUDIT_REPORT_DIR, `${report.generated_at_utc.replace(/[:]/g, '').replace(/\..+$/, '')}.json`);
  const payload = JSON.stringify(report, null, 2);
  fs.writeFileSync(latestPath, payload);
  fs.writeFileSync(stampedPath, payload);
  return { latestPath, stampedPath };
}

function doAudit() {
  const envFromFile = parseEnvFile(ENV_FILE);
  const projectRef = envFromFile.SUPABASE_PROJECT_REF;

  run('supabase', ['link', '--project-ref', projectRef], { stdio: 'inherit' });
  const listResult = run('supabase', ['migration', 'list']);

  const local = getLocalMigrationVersions();
  const remote = parseMigrationListOutput(listResult.stdout);

  const both = new Set([...local].filter((version) => remote.has(version)));
  const localOnly = setDifference(local, remote);
  const remoteOnly = setDifference(remote, local);

  const report = {
    generated_at_utc: new Date().toISOString(),
    project_ref: projectRef,
    counts: {
      local: local.size,
      remote: remote.size,
      both: both.size,
      local_only: localOnly.size,
      remote_only: remoteOnly.size,
    },
    local_only: toSortedArray(localOnly),
    remote_only: toSortedArray(remoteOnly),
  };

  const paths = writeAuditReport(report);
  console.log(JSON.stringify({ ...report, report_paths: paths }, null, 2));
}

function findMigrationFile(version) {
  for (const entry of fs.readdirSync(LOCAL_MIGRATIONS_DIR)) {
    if (entry.startsWith(`${version}_`) && entry.endsWith('.sql')) {
      return path.join(LOCAL_MIGRATIONS_DIR, entry);
    }
  }
  return null;
}

function doApplySingle(version) {
  if (!/^\d{14}$/.test(version)) {
    fail('Invalid --version value. Use 14-digit migration version, e.g. 20260405110000');
  }

  const envFromFile = parseEnvFile(ENV_FILE);
  const projectRef = envFromFile.SUPABASE_PROJECT_REF;
  const migrationFile = findMigrationFile(version);

  if (!migrationFile) {
    fail(`Local migration file not found for version ${version}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lub-supabase-apply-'));
  const tempMigrations = path.join(tempRoot, 'supabase', 'migrations');
  fs.mkdirSync(tempMigrations, { recursive: true });

  try {
    run('supabase', ['--workdir', tempRoot, 'link', '--project-ref', projectRef], { stdio: 'inherit' });
    run('supabase', ['--workdir', tempRoot, 'migration', 'fetch'], { stdio: 'inherit' });

    const targetFileName = path.basename(migrationFile);
    const targetInTemp = path.join(tempMigrations, targetFileName);
    fs.copyFileSync(migrationFile, targetInTemp);

    run('supabase', ['--workdir', tempRoot, '--yes', 'db', 'push', '--dry-run'], { stdio: 'inherit' });
    run('supabase', ['--workdir', tempRoot, '--yes', 'db', 'push'], { stdio: 'inherit' });

    console.log(`[supabase-migrations] Applied migration ${targetFileName}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  if (!command || command === '--help' || command === '-h') {
    console.log('Usage: node scripts/supabaseMigrations.mjs <audit|apply-single> [--version=YYYYMMDDHHMMSS]');
    process.exit(0);
  }

  if (command === 'audit') {
    doAudit();
    return;
  }

  if (command === 'apply-single') {
    const version = args.version;
    if (!version) {
      fail('Missing --version for apply-single');
    }
    doApplySingle(version);
    return;
  }

  fail(`Unknown command: ${command}`);
}

main();
