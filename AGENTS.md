# AquaRunner 24/7 Pro

Next.js 15 (App Router, React 19, Turbopack) + Prisma 6 + PostgreSQL, with Supabase Auth.
It's a commercial pool / water-feature maintenance app: technicians log SNHD-style service
visits (water chemistry, chemical doses, equipment readings, photos), and each property has a
public QR logbook at `/p/[publicSlug]`.

Standard commands live in `package.json` (`dev`, `build`, `start`, `lint`, `db:*`); the env
contract is in `.env.example`.

## Cursor Cloud specific instructions

### Services & how they run

This app needs three things running for full end-to-end use:

| Service | What it is | How it runs |
| --- | --- | --- |
| Local Supabase stack | Postgres (port `54322`) + Auth/GoTrue + Studio (`54323`), via Docker | `supabase start` (from repo root) |
| Next.js dev server | The app itself, on `http://localhost:3000` | `npm run dev` (see `package.json`) |
| Docker daemon | Required by the Supabase stack | started in this environment, see below |

The local Supabase stack is what makes login work: `.env` points
`NEXT_PUBLIC_SUPABASE_URL`/`DATABASE_URL` at it. There is no in-repo substitute for Supabase
Auth, so the stack must be up to test anything behind `/dashboard` or `/api/visits/*`.

### Starting from a fresh boot

The update script only refreshes dependencies; it does NOT start services. On a fresh VM boot:

1. Start the Docker daemon if `docker info` fails. This environment has no systemd, so run it
   directly (it needs root): `sudo dockerd` in a background/tmux session. If the daemon socket
   is owned by root, `sudo chmod 666 /var/run/docker.sock` lets the `ubuntu` user talk to it.
   Docker is configured for `fuse-overlayfs` with the containerd snapshotter disabled
   (`/etc/docker/daemon.json`) — this is required because Docker 29 otherwise can't use
   fuse-overlayfs in this kernel.
2. `supabase start` (idempotent; images are cached). Container names are prefixed
   `supabase_*_workspace`.
3. `npm run dev`.

### Database / seed

- `.env` (gitignored, present in the snapshot) holds the local-dev Supabase keys. If it ever
  goes missing, recreate it: `DATABASE_URL` =
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, and pull the anon/service keys
  from `supabase status -o env` (`ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`). `NEXT_PUBLIC_SUPABASE_URL` =
  `http://127.0.0.1:54321`. `SEED_DEV_PASSWORD` can be any value.
- Apply schema: `npx prisma migrate deploy` (or `npm run db:push`).
- Seed demo data + login users: `npm run db:seed`. The seed only creates Supabase Auth login
  users when `SUPABASE_SERVICE_ROLE_KEY` and `SEED_DEV_PASSWORD` are set (they are in `.env`).
- Seeded logins (password = `SEED_DEV_PASSWORD`, currently `aquarunner-dev-pass-2026`):
  `pool-admin@example.com`, `pool-office@example.com`, `pool-tech@example.com`.
- Inspect the DB directly with: `docker exec supabase_db_workspace psql -U postgres -d postgres -c "..."`.

### Gotchas

- `npm run lint` currently fails before linting any files: `package.json` pins
  `@eslint/eslintrc@^0.1.0` (resolves to `0.1.3`, which predates the `FlatCompat` export that
  `eslint.config.mjs` imports) alongside `eslint@^10` and `eslint-config-next@0.2.4`. These
  declared versions are mutually incompatible; this is a repo dependency-versioning issue, not
  an environment one. `next build` still type-checks the project.
- `prisma generate` runs as a `postinstall` hook and reads `.env` via `prisma.config.ts`, so it
  fails if `DATABASE_URL` is unset. Keep `.env` present before `npm install`.
- Photo upload only stores a metadata row (no real binary upload yet), so the "Complete service
  visit" button needs at least one photo — uploading any image file satisfies it.
