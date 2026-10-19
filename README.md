# Orders Console

Phases 1–2: React/Vite/TypeScript client, Express/TypeScript API, local MongoDB with Mongoose, seeded data, JWT login and admin-only order deletion. Order listing and creation are not implemented yet.

## Local setup

Requires Node.js 22.12+ and a running local MongoDB 8 instance.

```sh
cd server
npm install
npm run seed
npm run dev
```

In a second terminal, from the project root:

```sh
cd client
npm install
node -e "require('node:fs').copyFileSync('.env.example', '.env', require('node:fs').constants.COPYFILE_EXCL)"
npm run dev
```

The client and server have independent `package.json` files; run npm commands inside the relevant directory. Each `npm install` creates its own lockfile, which should be committed after review. There is no root npm workspace or root package manifest.

Before running the commands, copy each app's `.env.example` to `.env` if it does not exist, then fill in the blank settings. The client copy command above refuses to overwrite an existing file; skip it if you already have one. Review `MONGODB_URI` (for example `mongodb://127.0.0.1:27017/orders_console`), `PORT` and seed credentials in `server/.env`. Set `CLIENT_PORT` and `API_PORT` in `client/.env`; `API_PORT` must match the server's `PORT`. Database credentials, seed passwords and the JWT secret belong only in `server/.env`. Only the `.env.example` files belong in source control.

Set `JWT_SECRET` to a randomly generated value of at least 32 characters. You can generate one locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and paste it into `server/.env`. Never use the example middleware's hardcoded secret. The example auth settings give tokens a 900-second lifetime and allow 10 login requests per IP per 900,000 ms (15 minutes). Existing local auth settings have been added without changing database credentials or ports.

In PowerShell, if `mongod` is not on PATH, use its installed path, for example `& "C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe"` with the same arguments. MongoDB data under `.local/` is ignored by Git.

With client port 3000 and server port 8000, open http://localhost:3000. The page retains the `/api/health` connection check through Vite's development proxy. The API is at http://localhost:8000/api/health and returns `{"status":"ok","database":"connected"}`. Use your configured ports if different. It starts listening only after MongoDB connects and indexes are ready; a lost connection returns HTTP 503 once detected by the driver.

## Commands

Backend request handlers live in `server/src/controllers/`; routes only register URLs and middleware. Frontend screens live in `client/src/Pages/`, reusable UI in `client/src/components/`, and shared authentication state in `client/src/context/AuthContext.tsx`. Authentication still uses an in-memory Bearer token, not cookies.

Use Prettier for all code formatting. Run `npm run format` in each app before review, or `npm run format:check` to check formatting without changing files. Both apps use the root `.prettierrc.json`; generated files, environment files and `email.md` are excluded.

| Directory      | Command                | Purpose                                                               |
| -------------- | ---------------------- | --------------------------------------------------------------------- |
| Each directory | `npm install`          | Install that app's dependencies                                       |
| Each directory | `npm run dev`          | Run that app with reload                                              |
| `server/`      | `npm run seed`         | Insert missing demo users and 50,000 seed orders                      |
| Each directory | `npm run typecheck`    | Check that app's TypeScript                                           |
| Each directory | `npm run build`        | Build that app                                                        |
| Each directory | `npm run format`       | Format source and configuration with Prettier                         |
| Each directory | `npm run format:check` | Verify Prettier formatting                                            |
| `server/`      | `npm start`            | Run the built API only                                                |
| `server/`      | `npm test`             | Build and run auth integration tests using a temporary local database |

The frontend build is `client/dist`; serving/deploying it is outside this phase.

## Seed data

The script uses 1,000-order batches and deterministic ObjectIds with `$setOnInsert`. Rerunning inserts missing records without changing existing orders, timestamps, passwords, or roles. Interrupted runs can be resumed. It never clears collections. Run one seed process at a time; concurrent seed runs may report duplicate-key errors and can be rerun sequentially.

Orders have 1–5 items, varied names, emails, statuses, prices and quantities, and fixed dates between October 2025 and October 2026. Emails use the reserved example.com domain. `unitPrice` and `totalAmount` are integer minor currency units (e.g. 2499 means 24.99); totals equal the sum of quantity × unit price. The seed is synthetic, not customer data.

Seed credentials are configured using `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_AGENT_EMAIL` and `SEED_AGENT_PASSWORD` in `server/.env`.

Passwords are hashed with bcrypt (cost 12). Both seeded users can log in. Changing `.env` passwords does not reset existing users; changing email addresses creates additional users. Passwords are limited to 72 UTF-8 bytes to avoid bcrypt truncation.

## Indexes

- Users: unique normalized email.
- Orders: `{ createdAt: -1, _id: -1 }` and `{ totalAmount: -1, _id: -1 }` for stable sorting and future cursor pagination.
- Orders: the same two indexes prefixed with `status` for filtering plus sorting. Reverse scans support ascending order when both sort fields reverse.
- Orders: one text index on customer name and email for future word-based search. It is not a substring index, and text search combined with date/amount sorting may require an in-memory sort. The query implementation and query-plan verification belong to R1.
- Orders: partial unique `idempotencyKey` index covering strings only, allowing seed orders to omit the field. `requestHash` is reserved for R2. These fields alone do not implement retry/idempotency behavior.

## Manual verification

1. Run `npm run typecheck` and `npm run build` in both `client/` and `server/`.
2. In `server/`, run `npm run seed` twice. On an empty database, the first run reports 50,000 inserted; the second reports 0 inserted and 50,000 total.
3. In MongoDB Compass or mongosh, inspect `orders_console`: orders have 1–5 items and timestamps; users have bcrypt hashes and distinct roles. Inspect collection indexes.
4. Run `npm run dev` in each directory in separate terminals, visit the setup page and check its connection message. Open `/api/health` directly and confirm HTTP 200.
5. Stop MongoDB, wait for driver disconnect detection, then click Check connection: the page should show an error. Restart MongoDB and retry.

## What is not implemented yet

Order listing/creation and their UI, R1 stale-request protection, R2 duplicate-request proof, and final assessment documentation/screenshots are deferred to their requested phases. No optional assessment features, refresh tokens, signup, OAuth or deployment are included. Authentication has integration tests; frontend browser behavior still needs manual verification.

## Phase 1 checks performed

- `npm run typecheck` and `npm run build` passed.
- Two `npm run seed` runs against a fresh local MongoDB: 50,000 inserted, then 0 inserted; total stayed 50,000.
- A database verification script inspected all 50,000 orders: item counts 1–5, all four statuses present, exact item totals, and preserved seed timestamps. It checked both users' passwords against their bcrypt hashes and confirmed all seven order indexes (including `_id`).
- Direct and Vite-proxied health requests returned HTTP 200 with connected status; the frontend HTML returned HTTP 200.
- Browser rendering and the database-disconnection UI flow have not been manually verified.

## Authentication API

`POST /api/login` accepts JSON `{ "email": "your seeded email", "password": "your seeded password" }` and returns `{ token, user: { id, email, role } }`. Invalid input returns 400; incorrect credentials return 401; rate limiting returns 429 with `Retry-After`. Email is trimmed and lowercased; passwords are not trimmed.

All `/api/orders` routes require `Authorization: Bearer <token>`. `DELETE /api/orders/:id` returns 204 for successful admin deletion, 403 for an agent, 400 for a malformed ID, and 404 for a missing order. Missing/invalid/expired authentication returns 401 before the route handler runs. GET/POST orders are not implemented yet; an authenticated request to those methods returns 404.

The React auth provider stores the session in state and exposes `authenticatedRequest(path, options)`, which attaches the Bearer token and signs out on 401. Future orders screens must use this helper. There is no delete form yet; exercise deletion using an API client or the integration tests.

## Security review of the supplied code

| Finding                                                                                             | Fix                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A hardcoded, predictable signing secret is exposed in source.                                       | Load a random secret from the ignored server environment file and reject missing/short values at startup.                    |
| `jwt.decode()` reads claims without verifying the signature or expiry.                              | Use `jwt.verify()` and reject invalid or expired tokens.                                                                     |
| Token algorithms and payload shape are not constrained.                                             | Allow only HS256; validate ObjectId-shaped `sub`, allowed role, numeric `iat`, and mandatory `exp` with Zod.                 |
| Tokens have no expiration.                                                                          | Set an explicit lifetime when signing (15 minutes in the example configuration).                                             |
| Splitting the header blindly accepts malformed authentication schemes.                              | Require a correctly formed Bearer authorization header.                                                                      |
| Query-string tokens can leak through URL logging/history.                                           | Never read authentication from query parameters.                                                                             |
| The delete authorization check exists only in React and can be bypassed with a direct HTTP request. | Protect the orders router and enforce `requireRole('admin')` on the server.                                                  |
| Login compares plaintext passwords in a database query.                                             | Query by normalized email only, then verify the stored bcrypt hash with `bcrypt.compare()`.                                  |
| Unvalidated request values can become database operators or malformed IDs.                          | Validate login strings with Zod and validate delete IDs before querying MongoDB.                                             |
| Unlimited login attempts allow password guessing.                                                   | Apply a per-IP login limiter; compare against a dummy bcrypt hash for unknown accounts and return the same credential error. |
| A trusted token can contain a stale user/role.                                                      | Load the current user for authenticated requests and enforce the current database role.                                      |
| Deletion errors and missing records have no clear handling.                                         | Return explicit 400/404 responses and use a generic JSON error handler without exposing stack traces.                        |

JWT verification and expiration follow the [jsonwebtoken API](https://github.com/auth0/node-jsonwebtoken); throttling uses [express-rate-limit](https://express-rate-limit.mintlify.app/quickstart/usage).

### Token storage trade-off

The access token is held only in React memory, so a reload signs the user out and no token remains in localStorage, sessionStorage or cookies. The browser does not automatically attach it to cross-site requests, reducing conventional cookie-based CSRF exposure, but active XSS can still make authenticated requests or steal the token while the page is open. Sign-out clears memory and the query cache; it does not revoke a copied token, which remains usable until expiry unless the user is deleted or the signing secret changes.

### Phase 2 manual verification

1. Start MongoDB and run `npm run dev` in each app. Log in with the admin credentials used when seeding; verify email/role appear and the password field disappears.
2. Reload: the login screen must return. Log in as the agent, sign out, and check browser storage: no auth token should be stored there.
3. Submit a wrong password: expect a visible generic error. Repeat beyond `LOGIN_RATE_LIMIT_MAX`: expect 429. The limiter counts successful and failed login requests; restart the API or wait for its window before more manual attempts.
4. Use an API client to log in, then send a DELETE with `Authorization: Bearer <token>`. An agent gets 403 and the order stays. An admin gets 204 and the order is removed. Use a disposable record; reseeding restores a deleted deterministic seed order.
5. Repeat without a header or with an expired token: expect 401. `?token=...` alone must not authenticate. The automated suite also covers forged signatures, the wrong algorithm and malformed claims.

### Verification and limits

`npm test` in `server/` builds the server and runs nine security scenarios within one integration test (10 reported tests). It creates a uniquely named `orders_console_auth_test_*` database on the configured MongoDB server and drops only that database afterward; seeded application data is not changed. All 10 tests and the client production build passed during Phase 2.

The application database was empty at the end of Phase 2 (zero users and orders), so a login using the environment's seed credentials returned 401. Run `npm run seed` in `server/` before manual login. No application data was seeded or deleted during this phase.

The rate limiter uses process memory, resets on restart and is not shared across servers. Express does not trust forwarded IP headers; through the local Vite proxy clients may share a limiter bucket. Authentication has no refresh or revocation service; expired tokens require login again, and the UI discovers expiration on its next authenticated request. Browser interaction checks have not been automated or manually performed in this environment.
