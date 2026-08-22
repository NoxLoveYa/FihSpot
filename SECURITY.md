# FihSpot — Security Audit & Remediation Plan

Full-stack audit of the architecture (Express API + Prisma/Postgres, JWT + Google auth,
file uploads, scan-tile proxy, Docker/Caddy/nginx deployment, React/Vite client).

Findings are ordered by priority. Each item lists the affected files, the risk, and
the recommended fix.

## Implementation status (updated as fixes land)

| Item | Status |
|------|--------|
| #1 Fail-fast JWT secret | **Done** — server throws in production without a 32+ char `JWT_SECRET`; compose no longer injects a default |
| #2 Google token verification | **Done** — `aud` must match `GOOGLE_CLIENT_ID`, `iss` must be Google, only verified emails link accounts |
| #3 Upload hardening | **Done** — SVG rejected, magic bytes verified after write (file deleted on mismatch), `/uploads` served with `nosniff` + CSP `sandbox` |
| #4 Rate limiting | **Done** — global 1000/15 min; login/Google 10/15 min; register 5/h; scan tiles 600/15 min (`express-rate-limit`, trust proxy = 1) |
| #5 Security headers | **Done** — Caddy sets CSP/nosniff/frame-deny/referrer/permissions-policy; helmet on the API; inline theme script pinned by SHA-256 hash |
| #6 Location sharing audience | **Kept as-is** (product decision: all authenticated users) |
| #7 Bulk endpoint caps | **Done** — bounds queries capped at 2000 POIs; profile content capped at 200 per list; per-POI comments/photos capped at 200 |
| #8 Input length caps | **Done** — name ≤ 100, description ≤ 2000, category ≤ 50, comment ≤ 1000, search name ≤ 100, email ≤ 254, password ≤ 100 |
| #9 Nominatim proxy | **Done** — new `GET /api/geocode` proxies + caches searches (120 req/15 min); client uses it; Nominatim removed from browser CSP |
| #11 Docker hardening | **Done** — server image runs as `node` (uid 1000); Postgres credentials parameterized via `POSTGRES_*` env vars |

### Deployment notes from these changes

- Set a real `JWT_SECRET` in `.env` before deploying (required now).
- Override `POSTGRES_PASSWORD` **before the first** `docker compose up`; changing it
  later does not affect an already-initialized data volume.
- The uploads bind mount must be writable by uid 1000 on the host:
  `chown -R 1000:1000 server/uploads`.
- If the inline theme bootstrap script in `client/index.html` ever changes,
  regenerate its SHA-256 hash for the CSP in the `Caddyfile`.

---

## What is already OK

- `.env` is gitignored and was never committed to git history.
- SQL injection is not possible: all queries go through Prisma parameterized queries.
- No unsafe DOM sinks in the client: map-marker HTML is static or built with
  `textContent`; no `eval`, no user-controlled `innerHTML`.
- File deletion paths are sanitized (`path.basename` in `server/src/utils/files.ts`).
- Ownership checks on POIs / comments / photos are consistent and enforced server-side;
  admin routes are gated by `requireAuth` + `requireAdmin` at router level.
- Upload size limits are enforced (5 MB multer, 1 MB JSON body limit).
- HSTS is set in the Caddyfile; www → apex redirect is permanent.
- Error handler returns generic messages on 500 (no stack traces leaked).

---

## P0 — Critical

### 1. Forgeable JWT when `JWT_SECRET` is missing

- **Files:** `server/src/config.ts:10`, `docker-compose.yml:30`
- **Risk:** The config falls back to `'dev-secret-change-me'` (local) and docker-compose
  falls back to `dev-secret-docker`. If deployed without an explicit secret, anyone can
  mint valid tokens for any user ID — full authentication bypass, including admin.
- **Fix:** Fail fast at startup: throw if `NODE_ENV=production` and `JWT_SECRET` is
  unset (enforce a minimum length of 32+ chars). Remove the fallback or keep it only
  behind an explicit dev-only flag.

### 2. Google sign-in does not verify the token audience

- **File:** `server/src/routes/auth.ts:69-118`
- **Risk:** The `tokeninfo` response is used without checking:
  - `payload.aud === config.googleClientId` — a token issued for *any other* OAuth
    client is accepted;
  - `payload.email_verified === true`, while accounts are linked by email
    (`OR: [{ googleId }, { email }]`) — an attacker controlling another app can obtain
    a token carrying an arbitrary email claim and take over the matching FihSpot
    account.
- **Fix:** Verify `aud` against `GOOGLE_CLIENT_ID`, check `iss`
  (`accounts.google.com` / `https://accounts.google.com`), and require
  `email_verified` before linking/creating accounts by email. Prefer the
  `google-auth-library` `OAuth2Client.verifyIdToken()` over the raw tokeninfo endpoint.

---

## P1 — High

### 3. Stored XSS via extension-only upload validation

- **Files:** `server/src/middleware/upload.ts`, `server/src/app.ts:30`
- **Risk:** Files are accepted based only on filename extension and `.svg` / `.gif`
  are allowed. An SVG containing `<script>` is stored under `/uploads/` and served
  same-origin from `fihspot.com` — there is no `X-Content-Type-Options: nosniff` on the
  static route and no CSP anywhere in the chain. Combined with finding 5 (token in
  localStorage), this is a session-theft vector.
- **Fix:**
  - Drop `.svg` from the allow-list;
  - Validate actual file content (magic bytes / image decode probe), not just the name;
  - Serve `/uploads/` with `X-Content-Type-Options: nosniff` and a restrictive
    `Content-Security-Policy: sandbox` header.

### 4. No rate limiting anywhere

- **Files:** `server/src/app.ts` (all routes), especially `routes/auth.ts`,
  `routes/scan.ts`
- **Risk:**
  - `/api/auth/login` can be brute-forced indefinitely (no lockout, bcrypt cost 10);
  - `/api/scan/tile` proxies Google Static Maps with the server key — any user with
    search access can exhaust quota / run up billing;
  - `/api/auth/register` allows mass account creation.
- **Fix:** Add `express-rate-limit`: a global limiter plus strict per-route limiters on
  auth endpoints and the scan tile route. Consider progressive delays or lockout on
  repeated login failures.

### 5. JWT in localStorage, 7-day expiry, no revocation + missing security headers

- **Files:** `client/src/api/client.ts:21-41`, `client/src/context/AuthContext.tsx`,
  `Caddyfile`, `client/nginx.conf`
- **Risk:** The token is stored in localStorage (readable by any XSS) and is valid for
  7 days with no server-side revocation — logout only clears it client-side. No CSP,
  `X-Frame-Options`, or `X-Content-Type-Options` headers are emitted by Caddy or nginx,
  and `helmet` is not used server-side.
- **Fix:**
  - Add security headers at the Caddy layer (or via `helmet`): CSP, nosniff,
    frame-ancestors, referrer policy;
  - Shorten access-token life and/or add a refresh-token mechanism;
  - Longer term: move to HttpOnly Secure SameSite cookies to get XSS-resistant
    sessions (requires CSRF protection then);
  - Keep a server-side token denylist or version counter for logout/password change.

---

## P2 — Medium

### 6. Live GPS positions broadcast to every authenticated user

- **File:** `server/src/routes/locations.ts:55-87`
- **Risk:** `GET /api/locations` returns real-time coordinates of every opted-in user
  to *any* logged-in user. If "share location" is meant for friends/groups only, this
  is over-sharing precise movement data.
- **Decision needed:** confirm this is intended product behavior. Otherwise restrict to
  an explicit audience (friends list) or make each share ephemeral/scoped.

### 7. Unauthenticated bulk data exposure

- **Files:** `server/src/routes/pois.ts:32` (world-wide POI list), `routes/users.ts:46`
  (full public profile incl. all comments/photos/coordinates)
- **Risk:** Both endpoints work without auth and have no pagination cap, enabling
  trivial scraping of all content and cheap DoS via large queries.
- **Fix:** Add pagination limits, consider requiring auth for full enumeration, and
  return reduced payloads for anonymous requests if public browsing must stay.

### 8. Email enumeration

- **File:** `server/src/routes/auth.ts` (`register` returns 409 `EMAIL_TAKEN`)
- **Fix:** Return a generic response (e.g. always 201-style "check your inbox"
  behavior, or uniform timing/messages). Lower priority than items above.

### 9. No input length caps on user-generated text

- **Files:** `server/src/routes/pois.ts` (name/description/comment),
  `routes/admin.ts`, `routes/searches.ts`
- **Risk:** Only the 1 MB JSON body limits size; single fields can be arbitrarily
  long (storage abuse, rendering DoS).
- **Fix:** Enforce sane max lengths (e.g. name ≤ 100, description ≤ 2000, comment
  ≤ 1000) server-side.

### 10. Docker/deployment hardening

- **Files:** `docker-compose.yml`, `server/Dockerfile`
- **Items:**
  - Postgres credentials hardcoded (`fihspot:fihspot`) — move to env/secret;
  - Server container runs as root — add a non-root `USER` in the Dockerfile and fix
    volume permissions for `uploads/`;
  - Add `POSTGRES_PASSWORD_FILE`/secrets support if orchestrating beyond compose.

---

## P2.5 — Client-side findings (added after client inspection)

### 11. Google Maps API key shipped in the client bundle

- **Files:** `client/src/lib/googleMaps.ts:9`, `client/vite.config.ts`, build args in
  `docker-compose.yml:45-47`
- **Context:** Exposure itself is unavoidable for a JS API key, but the same key is
  also used directly for Static Maps (`staticMapUrl()`), which has no referrer
  protection unless configured.
- **Fix:** In Google Cloud Console restrict the browser key to HTTP-referrers of
  `fihspot.com/*` and to the specific APIs (Maps JavaScript API + Static Maps API).
  Prefer proxying Static Maps through `/api/scan/tile` (already done for scanning)
  instead of building URLs with the key client-side (`staticMapUrl` in
  `googleMaps.ts:24`) — deprecate/remove that helper if still used.

### 12. Search queries sent to third-party Nominatim (OpenStreetMap)

- **File:** `client/src/components/SearchBar.tsx:47` (`NOMINATIM_URL`)
- **Risk:** Every place-search keystroke (debounced 350 ms) is sent to a public
  third-party service along with the user's IP — a privacy/GDPR disclosure issue, and
  public Nominatim usage policy may be violated at scale.
- **Fix:** Proxy geocoding through the backend (add caching, rate limiting, and a
  proper User-Agent), or self-host Nominatim/Photon; disclose third-party sharing in
  the privacy policy either way.

### 13. Strict-CSP readiness of the client

- **Files:** `client/index.html:36-45` (inline theme script), Google GSI script
  loaded dynamically in `client/src/components/GoogleButton.tsx:37`, fonts from
  `fonts.googleapis.com`
- **Note:** When implementing the CSP from finding 5, remember:
  - the inline theme bootstrap script needs a nonce/hash (or inline it into the JS
    bundle);
  - `script-src` must allow `https://accounts.google.com`;
  - `style-src`/`font-src` must allow `fonts.googleapis.com` / `fonts.gstatic.com`.

### 14. Stale privilege UI from cached user

- **Files:** `client/src/api/client.ts:43-58` (cached user incl. role),
  `client/src/components/AdminRoute.tsx`
- **Risk:** A demoted admin keeps seeing admin UI until background revalidation lands.
  Not exploitable (the API enforces `requireAdmin`), but avoid showing privileged UI
  from cache.
- **Fix:** Treat cached role as display-only; gate admin routes on the revalidated
  user, or clear the cached user on version mismatch.

### 15. JWT passed into Web Workers via postMessage

- **Files:** `client/src/lib/waterScan.ts:323`, `client/src/lib/waterWorker.ts:39`
- **Risk:** Minimal (same-origin module workers), but the token is duplicated into
  worker scope for tile fetches.
- **Fix (optional):** Once auth moves to cookies (finding 5), workers fetch tiles
  cookie-authenticated and need no token copy at all.

---

## Suggested implementation order

| # | Item | Effort |
|---|------|--------|
| 1 | Fail-fast JWT secret validation (#1) | XS |
| 2 | Verify Google token aud/iss/email_verified (#2) | S |
| 3 | Upload magic-byte validation, drop SVG, nosniff (#3) | S |
| 4 | Rate limiting (auth, register, scan tiles) (#4) | S |
| 5 | Security headers via Caddy/helmet (#5, #13) | M |
| 6 | Decide on location-sharing audience (#6) | decision |
| 7 | Pagination caps / auth-gating of bulk endpoints (#7) | S |
| 8 | Input length caps (#9) | XS |
| 9 | Proxy Nominatim through backend (#12) | M |
| 10 | Restrict Google keys by HTTP-referrer (#11) | XS (config) |
| 11 | Docker hardening (#10) | S |
| 12 | Email enumeration + token lifecycle improvements (#8, #5) | L |
