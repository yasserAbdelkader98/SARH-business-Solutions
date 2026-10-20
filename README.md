# Orders Console

A local React + Express + MongoDB app for searching 50,000 orders and preventing duplicate order creation when requests retry with the same idempotency key. Built for SARH's Senior Full Stack assessment.

**Stack:** React/Vite, TypeScript, TanStack Query, Express, Mongoose, Zod, JWT. Optional O1/O2 were skipped.

## Run locally

**Prerequisites:** Node.js 22.12+, npm, and MongoDB Community 8 running locally on port `27017`. No Docker or hosted services.

From the repository root, use two terminals:

**API (`server/`):**

```sh
cd server
npm ci
node -e "const fs=require('node:fs');const crypto=require('node:crypto');fs.writeFileSync('.env',fs.readFileSync('.env.example','utf8').replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+crypto.randomBytes(32).toString('hex')),{flag:'wx'})"
npm run seed
npm run dev
```

**UI (`client/`):**

```sh
cd client
npm ci
node -e "require('node:fs').copyFileSync('.env.example','.env',require('node:fs').constants.COPYFILE_EXCL)"
npm run dev
```

Open **http://localhost:3000** (API health: **http://localhost:8000/api/health**). The commands creating `.env` intentionally fail if the file already exists; skip those commands on subsequent runs. Environment settings are documented in each package's `.env.example`. Keep `.env` out of Git. On a machine with prerequisites installed, setup targets under five minutes; fresh-machine setup has not been timed.

Set `MONGODB_URI` and seed credentials in `server/.env`; `JWT_SECRET`, token lifetime and login limits are also server-only. Keep client `API_PORT` equal to server `PORT`, and `APP_ORIGIN` equal to the frontend origin (default `http://localhost:3000`); localhost and 127.0.0.1 are different origins. Use `NODE_ENV=development` locally; production requires HTTPS and `NODE_ENV=production`. Stop running dev servers before `npm ci` on Windows to avoid locked dependency files.

**Demo accounts (local only):**

| Role  | Email               | Password        |
| ----- | ------------------- | --------------- |
| Admin | `admin@example.com` | `DemoAdmin123!` |
| Agent | `agent@example.com` | `DemoAgent123!` |

Reseeding preserves existing users/passwords. If these credentials do not work with an older local database, seed a fresh database via `MONGODB_URI`.

## Commands

Run from the indicated directory:

| Directory | Command                               | Purpose                                                                 |
| --------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `server`  | `npm run seed`                        | Seed 50,000 orders and demo users (safe to rerun)                       |
| `server`  | `npm run proof:idempotency`           | Parallel duplicate-create proof                                         |
| `server`  | `npm test`                            | Real MongoDB integration tests (isolated temporary databases)           |
| `client`  | `npm test`                            | Playwright tests with mocked APIs; Edge on Windows, or install Chromium |
| Both      | `npm run typecheck` / `npm run build` | Typecheck and build                                                     |
| Both      | `npm run format:check`                | Check Prettier formatting                                               |

For non-Windows browser testing, run `npx playwright install chromium` in `client/` first. The seed inserts in batches with deterministic IDs; it creates orders with 1–5 items, varied dates, statuses and amounts.

## What it does

**R1 — list:** `GET /api/orders` supports `search`, `status`, `sortBy` (`createdAt`/`totalAmount`), `sortOrder` and `page` (25 rows/page). Search is a **name phrase match** or **exact email match**, not arbitrary substring search. MongoDB has status/sort compound indexes, an email index, a text index and deterministic `_id` tie-breaking. Queries use `lean()` and return only one page. TanStack Query isolates results by filter/user query key, passes `AbortSignal` to fetch, and debounces search (600 ms); rapid filter changes cannot display an older filter's response.

**R2 — create:** `POST /api/orders` validates 1–5 items server-side, calculates totals in integer cents and requires a UUID `Idempotency-Key`. Each order atomically stores its key and canonical request hash behind a **unique MongoDB index**. Concurrent retries by the same user with the same key and normalized payload return the same order; a changed payload/user gives `409`. Click Create order to open the form; closing it preserves the draft. The UI keeps the submitted payload/key in `sessionStorage` until Start new order clears it. If a duplicate insert's winner is temporarily unavailable, the server retries reads, then returns `503` with instructions to retry the same key/payload.

To prove R2, run `npm run proof:idempotency` from `server/`. It sends two concurrent requests and checks matching order IDs and **exactly one** matching record (`databaseCount: 1`), plus mismatch and retry cases. The guarantee applies only while the keyed order remains stored: **hard-deleting an order removes its deduplication key**. A new key can create a similar business order.

**Auth/API:** `POST /api/login`, `GET /api/me`, `POST /api/logout`; `/api/orders` routes require authentication, and `DELETE /api/orders/:id` requires an admin. JWTs are sent only via an HttpOnly cookie; mutations require an `Origin` header exactly matching `APP_ORIGIN`, including login/logout and API-client requests. The API uses port 8000, proxied by Vite at `/api`.

## Security review of supplied middleware

| Problem found                                             | Fix                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Hard-coded JWT signing secret                             | Secret from `.env`, generated locally                                                    |
| `jwt.decode()` trusts unsigned/unverified claims          | `jwt.verify()` with HS256, expiration and validated payload                              |
| Tokens accepted in query parameters / weak header parsing | Cookie-only token transport; no query or Bearer fallback                                 |
| No token expiry                                           | Short-lived configurable JWT                                                             |
| Client-side-only admin check                              | Server-side authentication and role authorization                                        |
| Plaintext password lookup                                 | bcrypt hashes and comparison                                                             |
| Unvalidated input and user claims                         | Zod validation, ObjectId checks and current user/role lookup                             |
| Brute-force / account-enumeration exposure                | Per-IP login rate limit, generic errors, dummy bcrypt comparison                         |
| Cookie-based CSRF risk                                    | SameSite=Strict and exact Origin checks for mutations                                    |
| Unclear deletion/error behavior                           | Explicit 400/404/204 responses; unexpected errors do not expose stack traces             |
| Sensitive session responses could be cached               | `Cache-Control: no-store` on login/me/logout; no token or password hash in response JSON |

**Token storage (2–3 sentences):** The short-lived JWT is stored in a host-only, HttpOnly cookie with `SameSite=Strict` and `Secure` in production, so JavaScript cannot directly read it. This reduces token theft through XSS but does not prevent an injected script from sending authenticated requests; SameSite and server-side Origin checks help mitigate CSRF. Logout clears the cookie but does not independently revoke a previously copied JWT before expiry.

## Product question: “Delete all cancelled orders”

- Is the real issue clutter, retention cost or a broken cancellation workflow?
- Which orders are in scope, and what audit, legal retention or recovery rules apply?
- Who can authorize deletion and should it be reversible?
- Until those answers are clear, use the existing status filter to hide cancelled orders instead of bulk deletion.
- Hard deletion would also remove idempotency evidence, so agree on a retention policy first.

## Verification, trade-offs and demo

Reported verification: both builds/typechecks, 26 backend checks, seven mocked-API browser tests and the parallel R2 proof passed; the seed was rerun successfully on a temporary database. Browser tests simulate slow responses but are **not** a full-stack load benchmark.

**Skipped:** O1/O2 to prioritize mandatory correctness within the time budget; refresh tokens/OAuth and deployment infrastructure are outside this local assessment; 25-row pages avoid needing virtualization, and indexed phrase/exact-email search avoids additional search infrastructure. **Known limits:** deep offset pagination/exact counts are costly at scale; search is not arbitrary substring matching; process-local login rate limits do not span multiple servers; the UI retains pending customer data in `sessionStorage`; deleting orders can remove idempotency evidence. See [DECISIONS.md](DECISIONS.md) and [SCALE.md](SCALE.md).

**Demo:** Follow [DEMO.md](DEMO.md). Add a two-minute screen recording showing R1 filters (including three rapid changes) and the concurrent R2 proof.
