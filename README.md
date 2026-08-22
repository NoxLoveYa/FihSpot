# FihSpot

A mobile-first web app for anglers: discover, share and discuss **fishing spots**
(points of interest) on an interactive Google Maps view — with photos, comments,
automatic **water detection** ("scan") to find unmarked ponds, live location sharing,
saved searches and a full admin back-office.

> Detailed product spec & feature history (in French): see [PLAN.md](PLAN.md).

---

## Architecture

```
                    ┌───────────────────────────┐
   HTTPS 80/443 ──► │  Caddy (TLS auto, HSTS,   │
                    │  CSP, security headers)   │
                    └────────────┬──────────────┘
                                 │ reverse proxy
                    ┌────────────▼──────────────┐
                    │  client (nginx)           │
                    │  React SPA static files   │
                    │  /api,/uploads → server   │
                    └────────────┬──────────────┘
                                 │
                    ┌────────────▼──────────────┐      ┌──────────────┐
                    │  server (Node/Express)    │─────►│ Google APIs  │
                    │  REST API, auth, uploads, │      │ (Maps JS,    │
                    │  scan tile proxy + cache  │      │ Static Maps) │
                    └────────────┬──────────────┘      └──────────────┘
                                 │ Prisma
                    ┌────────────▼──────────────┐
                    │  PostgreSQL 16 (db)       │
                    └───────────────────────────┘
```

### Monorepo layout (npm workspaces)

| Path | What |
|---|---|
| `client/` | React 18 + TypeScript + Vite SPA. Google Maps (Advanced Markers), Tailwind CSS, Framer Motion, i18n EN/FR. Water scan runs pixel analysis in Web Workers on map tiles proxied by the server. |
| `server/` | Express 4 REST API. Auth (email/password bcrypt + Google sign-in), POIs/comments/photos CRUD, saved searches, live locations, geocoding proxy, admin back-office. Prisma ORM → PostgreSQL. Uploads stored on disk (`server/uploads`). |
| `db` | PostgreSQL 16 container (data in the `pgdata` Docker volume — survives rebuilds). |
| `caddy/` | Public entrypoint: automatic TLS for `fihspot.com`, HSTS, Content-Security-Policy, security headers. |
| `scripts/` | Ops scripts: `dev.sh`, `deploy.sh`, `db-backup.sh`, `db-restore.sh`. |

Key design points:

- **API key isolation** — the browser uses one public key (restricted by HTTP referrer);
  the server has its own dedicated key (IP-restricted, Static Maps only) used to
  proxy & cache scan tiles via `/api/scan/tile`. The browser never talks to Google's
  Static Maps for scans.
- **Geocoding is proxied** through `/api/geocode` (in-memory cache) so users' queries
  never reach the third-party service directly.
- **Security hardening** — mandatory `JWT_SECRET` in prod, strict Google token
  verification (`aud`/`iss`/`email_verified`), upload magic-byte validation,
  per-route rate limiting, pagination caps. See the "Security" section below.

---

## Requirements

- **Node.js ≥ 20** (dev builds run fine on 18+; containers use Node 22)
- **Docker + Docker Compose v2** (Postgres runs in Docker even for local dev)
- A `.env` file at the repo root (see below)

## Environment variables

Copy the template then fill in values:

```bash
cp .env.example .env
```

| Variable | Used by | Notes |
|---|---|---|
| `JWT_SECRET` | server | **Required in production** — min 32 chars, the server refuses to boot otherwise. Generate with `openssl rand -base64 48` |
| `DATABASE_URL` | server | Local dev default: `postgresql://fihspot:fihspot@localhost:5432/fihspot` |
| `POSTGRES_USER/PASSWORD/DB` | compose | DB credentials (defaults `fihspot/fihspot/fihspot`) — override **before first start**; changing later does not alter an initialized volume |
| `CLIENT_URL` | server | CORS origin, e.g. `https://fihspot.com` (prod) or `http://localhost:5173` (dev) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server | OAuth client for "Continue with Google". Empty = button hidden |
| `ADMIN_EMAILS` | server | Comma-separated emails auto-promoted to ADMIN at login |
| `GOOGLE_MAPS_SERVER_KEY` | server | **Server-only** key for the scan tile proxy. Restrict by IP (VPS IPv4 + IPv6) and to *Maps Static API* |
| `VITE_GOOGLE_MAPS_API_KEY` | client (build time) | Browser key for the interactive map. Restrict by HTTP referrer `https://fihspot.com/*` |
| `VITE_GOOGLE_MAPS_MAP_ID` | client (build time) | Google Maps **Map ID** (required for Advanced Markers / dark mode) |

⚠️ Client vars are baked into the bundle at **build time** — changing them requires
rebuilding the client image.

---

## Development

```bash
# 1. install dependencies (both workspaces)
npm install

# 2. start PostgreSQL only (recommended)
docker compose up -d db

# 3. apply schema + optional demo data (demo POIs visible in dev only)
npm run db:migrate
npm run db:seed        # creates demo@fihspot.app / demo1234 + 5 demo POIs

# 4. run server (:3000) + client (:5173) with hot reload
npm run dev            # or: bash scripts/dev.sh (adds an env sanity check)
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/uploads`
to `localhost:3000`.

Notes:
- Demo POIs (`demo = true`) are excluded by the API whenever `NODE_ENV=production`;
  plain `npm run dev` shows them.
- Client-only env overrides can go in `client/.env` (see `client/.env.example`).

## Production

This repository deploys as a single Docker Compose stack fronted by Caddy
(TLS certificates are issued automatically for the domain in the `Caddyfile`).

```bash
# fill in real values first (JWT_SECRET, CLIENT_URL, keys...)
cp .env.example .env && $EDITOR .env

# build images and start everything (validates env, waits for /api/health)
npm run deploy

# redeploy after code changes — same command
git pull && npm run deploy

# recreate containers without rebuilding (e.g. after .env change)
npm run deploy -- --skip-build
# or just one service:
docker compose up -d server
```

What `deploy.sh` does: validates required env → `docker compose build --pull` →
`up -d` → polls the API health endpoint until ready (migrations run automatically
at container start) → prunes dangling images → prints the deployed revision.

### Backups (do set this up!)

```bash
npm run db:backup                     # dumps to backups/fihspot-<timestamp>.sql.gz
npm run db:restore <file.sql.gz>      # destructive, asks for confirmation
```

Retention defaults to 14 days (`BACKUP_RETENTION_DAYS` to override). Cron it, e.g.:

```
0 4 * * * cd /path/to/FihSpot && npm run db:backup >> backups/backup.log 2>&1
```

### Useful ops commands

```bash
docker compose ps                     # stack status
docker compose logs -f server         # tail API logs (also: client, db, caddy)
docker compose exec server sh         # shell inside the API container
docker volume ls                      # pgdata holds ALL app data
```

### Deployment gotchas

- The server container runs **as non-root (uid 1000)**. Bind-mounted host dirs must
  be writable by that uid: `chown -R 1000:1000 server/uploads`.
  If you see `EACCES` writing to `cache/scan-tiles`, fix ownership inside the named
  volume once: `docker compose exec -u root server chown -R node:node /app/server/cache`.
- Database data lives in the `pgdata` volume — `docker compose down` keeps it,
  `down -v` **deletes it**.
- Changing `VITE_*` variables requires a client image rebuild (`npm run deploy`).
- If the inline theme script in `client/index.html` changes, regenerate its SHA-256
  hash for the CSP in the `Caddyfile`.

---

## API overview

All errors return `{ error, code }` (stable machine code + English message; the
client translates codes via i18n). Auth uses `Authorization: Bearer <jwt>`.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register` · `login` · `google` · `GET /api/auth/me` · `/config` |
| POIs | `GET/POST /api/pois`, `GET/PATCH/DELETE /api/pois/:id`, comments & photos sub-routes, `POST/DELETE /api/pois/:id/seen` |
| Profile | `GET /api/me`, `GET /api/users/:id` (public), `POST /api/me/avatar` |
| Spot search 🔒 | `GET/POST/PATCH/DELETE /api/searches`, `GET /api/scan/tile` |
| Live location 🔒 | `POST /api/locations/share` · `/api/locations` |
| Geocoding | `GET /api/geocode?q&lang` (cached proxy) |
| Admin 🔒 | `/api/admin/stats` · `/users` · `/pois` · `/moderation` |

🔒 = requires auth (and admin role / search access where noted). Rate limits apply
globally (1000/15 min) and strictly on auth (10/15 min), register (5/h), scan tiles
(600/15 min) and geocoding (120/15 min).

## Security summary

- JWT sessions (7-day expiry) — secret enforced ≥32 chars in production
- Google sign-in verifies token audience, issuer and email verification before linking
- Uploads: extension allow-list **and** magic-byte validation; SVG rejected;
  served with `nosniff` + CSP `sandbox`
- Strict CSP/security headers at the Caddy layer; helmet on the API
- Input length caps + pagination caps on all list endpoints
- API keys split: public browser key (referrer-restricted) vs IP-restricted server key

## Tech stack quick reference

React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · Framer Motion · i18next ·
Google Maps JS API (@googlemaps/js-api-loader) · Express 4 · Prisma ORM ·
PostgreSQL 16 · JWT · multer · express-rate-limit · helmet · nginx · Caddy 2 ·
Docker Compose
