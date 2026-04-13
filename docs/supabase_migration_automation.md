# Supabase Migration Automation (Safe Mode)

This project uses a safe migration helper script that reads credentials from:

- `lub-private/supabase-cli.env`

## Required Keys

```env
SUPABASE_ACCESS_TOKEN=...
SUPABASE_PROJECT_REF=...
SUPABASE_DB_PASSWORD=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are required for migration commands.

## Commands

Run a non-destructive migration status audit:

```bash
npm run db:migrations:audit
```

This generates reports under:

- `lub-private/migration-audit/latest.json`
- `lub-private/migration-audit/<timestamp>.json`

Apply exactly one migration version safely:

```bash
npm run db:migration:apply:single -- --version=20260405110000
```

### Safety behavior for single apply

1. Uses an isolated temp Supabase workdir.
2. Fetches remote migration history into temp.
3. Adds only the requested local migration file.
4. Runs dry-run first.
5. Applies only that one migration.

This avoids accidentally applying backlog migrations from local history drift.
