# Orders Console

Phases 1–4: React/Vite/TypeScript client, Express/TypeScript API, local MongoDB with Mongoose, seeded data, JWT login, admin-only order deletion, a searchable paginated orders list, and idempotent order creation.

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

Backend order handlers live together in `server/src/controllers/orders.ts`; their Zod schemas live in `server/src/validation/Orders.ts`. Routes only register URLs and middleware. Frontend screens live in `client/src/Pages/`, reusable UI in `client/src/components/`, and shared authentication state in `client/src/context/AuthContext.tsx`. Authentication uses an HttpOnly, SameSite=Strict cookie; React holds only the user profile.

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
- Orders: one text index on customer name and email for word-based search. It is not a substring index; text search with date/amount sorting requires sorting matching results separately.
- Orders: `{ customerEmail: 1 }` for exact, lowercased email lookup. Searches containing `@` take this path instead of text tokenization.
- Orders: partial unique `idempotencyKey` index covering strings only, allowing seed orders to omit the field. Every API create requires a UUID key; `requestHash` stores the server-generated canonical request hash used to distinguish retries from conflicts.

## Manual verification

1. Run `npm run typecheck` and `npm run build` in both `client/` and `server/`.
2. In `server/`, run `npm run seed` twice. On an empty database, the first run reports 50,000 inserted; the second reports 0 inserted and 50,000 total.
3. In MongoDB Compass or mongosh, inspect `orders_console`: orders have 1–5 items and timestamps; users have bcrypt hashes and distinct roles. Inspect collection indexes.
4. Run `npm run dev` in each directory in separate terminals, visit the setup page and check its connection message. Open `/api/health` directly and confirm HTTP 200.
5. Stop MongoDB, wait for driver disconnect detection, then click Check connection: the page should show an error. Restart MongoDB and retry.

## Orders list (R1)

`GET /api/orders?search=Ahmed&status=pending&sortBy=createdAt&sortOrder=desc&page=1` returns `{ orders, total, page, pageSize, totalPages }`. Page size is fixed at 25. Only `_id`, customer name/email, status, amount and creation date are selected, with `lean()` used to avoid Mongoose document hydration. Both admin and agent users can list orders.

Query parameters are validated with Zod: status must be a known status, sort field must be `createdAt` or `totalAmount`, direction must be `asc` or `desc`, and page must be a positive integer (maximum 1,000,000). Search is trimmed and limited to 100 characters. Unknown or repeated parameters return 400; omit status to include all statuses. A page beyond the last page returns an empty list with the requested page and current total.

Search without `@` uses a quoted MongoDB text phrase: `Hana Nasser` matches those words together, not either word separately. Matching is case-insensitive and still uses the text index; quotes/backslashes are removed and whitespace is normalized before constructing the phrase. A phrase is not whole-field equality: a longer name containing that phrase can also match. Search containing `@` matches the exact normalized email. Partial name/email substrings are deliberately unsupported. These semantics avoid unbounded regex scans and use local MongoDB indexes without an additional service. See [MongoDB text indexes](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/).

Date and amount sorts include `_id` in the same direction as a deterministic tie-breaker. The existing sort indexes, with separate status-prefixed variants, serve plain/filtered lists. Text searches use the text index but sort their matched results separately; exact email searches use the email index, with sorting over its matches. Exact totals cost an additional count query; unfiltered counting is hinted to the `_id` index. Both operations have a five-second database time limit.

Offset pagination keeps page numbers and total counts easy to understand, but deeper pages scan past earlier index entries. Deterministic sorting prevents ambiguous ties; it does not freeze the dataset across concurrent inserts/deletes, and the parallel count/list queries are not a snapshot transaction. Cursor pagination and snapshot reads are deliberately outside this phase.

### Stale responses and manual verification

The query key contains the user ID plus search, status, sort field, direction and page. TanStack Query keeps results separated by key, and its AbortSignal reaches fetch through the authentication helper. No previous-filter placeholder data is displayed. Search waits 600 ms after typing, hides old rows during that wait, and changes the applied search and page together. Status/sort changes reset page to 1 in the same state update. See [query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) and [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

1. Seed the application database yourself if needed, start both apps, and sign in. With 50,000 seed orders and no filters, expect 25 rows and 2,000 pages.
2. Search `Ahmed` or paste an exact customer email from a row. Change status and check every visible row has that status. Change sorting in both directions and navigate between pages.
3. Navigate to page 2, then change search/status/sort; the next results must be page 1.
4. In browser DevTools, enable network throttling. Change status from Processing to Completed to Cancelled quickly. While pending, old rows disappear; once rows appear, they must all be Cancelled, including after earlier requests finish.
5. Search an unknown name for the empty state. Stop the API and change a filter to see the error and Retry button. Restart it and retry.

`npm test` in `server/` includes the auth regression tests and a separate test database containing 50,000 orders. It checks projection, pagination, total count, filters, exact-email/name search, both sorts/directions, tie-breakers, invalid parameters and indexed query plans. Both temporary databases are removed afterward; the application database is not modified.

`npm test` in `client/` runs Playwright browser checks against a temporary Vite server on port 4174, with mocked API responses to force older requests to finish later. It also checks that no Bearer header is sent, pagination reset, debounce, error/retry and empty state. Windows uses installed Microsoft Edge; on other systems install the test browser once with `npx playwright install chromium`. No backend or application credentials are required for these browser tests.

Phase 3 verification: all 16 reported backend tests and both browser tests passed. The browser race test deliberately ignores transport cancellation, exercising query-key isolation even when old responses arrive later. On the isolated 50,000-row fixture, ordinary list plans examined 25 keys for 25 rows, exact email examined one key, and a broad text search examined 25,000 matching keys; none of the four inspected plans used a collection scan. These are local observations, not a production latency guarantee.

## Create order (R2)

`POST /api/orders` requires the authentication cookie, a trusted `Origin` header and `Idempotency-Key: <UUID>`. Example JSON (prices are integer cents):

```json
{
  "customerName": "Hana Nasser",
  "customerEmail": "hana@example.com",
  "items": [
    { "name": "Notebook", "quantity": 3, "unitPrice": 10 },
    { "name": "Pen", "quantity": 1, "unitPrice": 20 }
  ]
}
```

The server calculates `totalAmount: 50` and sets status to `pending`. Client-supplied totals, status, hashes and unknown fields are rejected. Zod validates both the form and API: 1–5 items, quantities from 1 to 10,000, nonnegative integer-cent prices up to 100,000,000, customer name up to 200 characters, email up to 254 and item name up to 120. These bounds keep all products and totals within JavaScript's safe integer range. The form converts decimal price strings by splitting whole and fractional parts, avoiding floating-point multiplication for conversion to cents.

The controller normalizes names by trimming and emails by trimming/lowercasing, then constructs an explicit property-ordered object containing the authenticated user ID, customer details and ordered items. Its SHA-256 hash and the key are inserted atomically with the order. Object-property order does not affect the hash; item-array order does. The server does not run a pre-insert lookup: the database's unique index decides which concurrent insert wins. See MongoDB's [single-document atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/) and [unique index guarantees](https://www.mongodb.com/docs/manual/core/index-unique/).

- New key: HTTP 201 with `{ order }`.
- Existing key and same canonical request/user: HTTP 200 with the stored order and same ID.
- Existing key with changed canonical request or another user: HTTP 409, without modifying the order.
- Duplicate-key error while the winning order is not visible: retry primary reads up to five times with 50 ms pauses. If unavailable, return HTTP 503 and `Retry-After: 1`; the caller must retry the same key and payload. No fallback insert occurs in this branch.

### Client operation lifecycle

The first valid submission generates `crypto.randomUUID()` and saves the key and validated payload in sessionStorage under the user ID before sending. Submitted fields remain locked so Retry same order resends exactly the same payload/key after a network failure, a 15-second client timeout, or a page reload in the same tab. A synchronous in-flight guard blocks double-clicks before React re-renders; the database remains the actual duplicate-prevention guarantee.

Success retains the operation and shows its order ID. Only Start new order clears it and enables a fresh submission; abandoning an unresolved request requires confirmation because it may already have succeeded. Successful creation invalidates the orders queries, with no optimistic rows. The new order may not appear under the current search/status/page settings.

Only the pending/completed create operation (including customer details) is kept in sessionStorage, not the access token. It survives same-tab reloads but is lost when the tab/storage is cleared. It remains available to scripts on the same origin, so it is not protected against XSS. If sessionStorage cannot be written, the form does not initiate a new request.

### Runnable duplicate proof

With local MongoDB running and `server/.env` configured:

```sh
cd server
npm run proof:idempotency
```

This starts the real Express app on a temporary port against a uniquely named temporary database. It sends two identical POST requests with `Promise.all`, asserts statuses 201/200 and identical order IDs, then queries MongoDB to assert exactly one document has that key. It prints both IDs and `databaseCount: 1`. It also checks changed-payload 409, canonicalization, lost-response replay, separate-user conflicts, validation, and the bounded delayed-visibility/503 path. The temporary database is dropped afterward; your application database is untouched.

Run `npm test` in `server/` for all backend tests, or in `client/` for the browser tests. Browser tests exercise double submission, a lost response, reload/re-login with the same operation, a genuinely new key, exact cent conversion, client validation and item limits. The eight reported standalone proof tests and all four browser tests passed during Phase 4; builds and type checks passed as well.

### Guarantee and limits

The guarantee is at most one stored order per UUID key while its indexed order record exists, regardless of concurrent requests or application process restarts against the same database. Same-key retries return that order; they do not create a second one. It is not business-level duplicate detection: identical customer/items sent with a fresh key represent a new operation and may create another order.

Deleting the order also deletes its key/hash, so replay after an admin hard-delete can create an order again. Clearing storage, closing a tab, manually abandoning an uncertain request, database loss, or removing the unique index falls outside the guarantee. No permanent idempotency ledger, cross-device draft recovery, external side-effect guarantee, Redis, queue, distributed lock or multi-document transaction is implemented.

To verify manually, create an order and check the displayed total. Inspect the POST's UUID header, retry after a simulated network failure, and confirm the same key is reused. Reload to recover the session and saved operation; sign in again only if the cookie has expired. Start new order should be the only normal action that clears the completed/pending operation and permits a new key.

## Remaining assessment work

Final assessment documentation consolidation and screenshots/design memo are deferred to their requested phases. No optional assessment features, refresh tokens, signup, OAuth or deployment are included. There is no virtualization, infinite scrolling or optimistic creation.

## Phase 1 checks performed

- `npm run typecheck` and `npm run build` passed.
- Two `npm run seed` runs against a fresh local MongoDB: 50,000 inserted, then 0 inserted; total stayed 50,000.
- A database verification script inspected all 50,000 orders: item counts 1–5, all four statuses present, exact item totals, and preserved seed timestamps. It checked both users' passwords against their bcrypt hashes and confirmed all seven order indexes (including `_id`).
- Direct and Vite-proxied health requests returned HTTP 200 with connected status; the frontend HTML returned HTTP 200.
- Browser rendering and the database-disconnection UI flow have not been manually verified.

## Authentication API

`POST /api/login` accepts JSON `{ "email": "your seeded email", "password": "your seeded password" }` and sets the authentication cookie and returns `{ user: { id, email, role } }`. Invalid input returns 400; incorrect credentials return 401; rate limiting returns 429 with `Retry-After`. Email is trimmed and lowercased; passwords are not trimmed.

All `/api/orders` routes require the `access_token` cookie. Bearer headers and query-string tokens are not accepted. `GET /api/me` restores the current user after reload; `POST /api/logout` clears the cookie, including when it has expired. `DELETE /api/orders/:id` returns 204 for successful admin deletion, 403 for an agent, 400 for a malformed ID, and 404 for a missing order. Missing/invalid/expired authentication returns 401 before the route handler runs. Both admin and agent users can GET the list and POST a new order.

The React auth provider stores only the user in state and exposes `authenticatedRequest(path, options)`. Fetch uses same-origin credentials so the browser sends the cookie; a 401 clears the user and query cache. The orders list uses this helper and passes its AbortSignal through to fetch. Admins see a delete icon in each order row and must confirm before deletion. Agents do not see the action. Backend role checks remain authoritative, and failures are shown without removing the row.

## Security review of the supplied code

| Finding                                                                                             | Fix                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A hardcoded, predictable signing secret is exposed in source.                                       | Load a random secret from the ignored server environment file and reject missing/short values at startup.                    |
| `jwt.decode()` reads claims without verifying the signature or expiry.                              | Use `jwt.verify()` and reject invalid or expired tokens.                                                                     |
| Token algorithms and payload shape are not constrained.                                             | Allow only HS256; validate ObjectId-shaped `sub`, allowed role, numeric `iat`, and mandatory `exp` with Zod.                 |
| Tokens have no expiration.                                                                          | Set an explicit lifetime when signing (15 minutes in the example configuration).                                             |
| Splitting the header blindly accepts malformed authentication schemes.                              | Read authentication only from the HttpOnly cookie and verify its JWT.                                                        |
| Query-string tokens can leak through URL logging/history.                                           | Never read authentication from query parameters.                                                                             |
| The delete authorization check exists only in React and can be bypassed with a direct HTTP request. | Protect the orders router and enforce `requireRole('admin')` on the server.                                                  |
| Login compares plaintext passwords in a database query.                                             | Query by normalized email only, then verify the stored bcrypt hash with `bcrypt.compare()`.                                  |
| Unvalidated request values can become database operators or malformed IDs.                          | Validate login strings with Zod and validate delete IDs before querying MongoDB.                                             |
| Unlimited login attempts allow password guessing.                                                   | Apply a per-IP login limiter; compare against a dummy bcrypt hash for unknown accounts and return the same credential error. |
| A trusted token can contain a stale user/role.                                                      | Load the current user for authenticated requests and enforce the current database role.                                      |
| Deletion errors and missing records have no clear handling.                                         | Return explicit 400/404 responses and use a generic JSON error handler without exposing stack traces.                        |

JWT verification and expiration follow the [jsonwebtoken API](https://github.com/auth0/node-jsonwebtoken); throttling uses [express-rate-limit](https://express-rate-limit.mintlify.app/quickstart/usage).

### Token storage trade-off

The JWT is stored in a host-only HttpOnly cookie with `SameSite=Strict`, path `/api`, and a maximum age matching its JWT expiration. `Secure` is enabled when `NODE_ENV=production`; production must use HTTPS. JavaScript cannot read the token, but active XSS can still send authenticated requests. Logout clears the browser cookie and query cache; it does not revoke a copied JWT, which remains usable until expiration unless the user is deleted or the signing secret changes. No refresh tokens are added.

SameSite reduces cross-site cookie sending, but is not the only CSRF defense: every POST/PUT/PATCH/DELETE request, including login and logout, must have an `Origin` exactly matching `APP_ORIGIN`. Missing, null or other origins return 403. This also rejects other ports or sibling origins that could otherwise be considered same-site. API clients and scripts must supply the configured Origin and a cookie jar. See [MDN cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [OWASP origin verification](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#verifying-origin-with-standard-headers).

Set `APP_ORIGIN=http://localhost:3000` in `server/.env` for the current local frontend and `NODE_ENV=development`. Change APP_ORIGIN if the frontend hostname, protocol or port changes; localhost and 127.0.0.1 are different origins. The frontend and API must share an origin via Vite's proxy locally and a reverse proxy in production. Set NODE_ENV=production and APP_ORIGIN to the HTTPS frontend origin for deployment. There is no cross-origin CORS configuration.

### Phase 2 manual verification

1. Start MongoDB and run `npm run dev` in each app. Log in with the admin credentials used when seeding; verify email/role appear and the password field disappears.
2. Reload: you stay signed in until expiry. In DevTools Cookies, inspect access_token: HttpOnly, SameSite Strict, path /api. The token must not appear in localStorage, sessionStorage or the login response JSON. Sign out, reload, and confirm the login screen returns.
3. Submit a wrong password: expect a visible generic error. Repeat beyond `LOGIN_RATE_LIMIT_MAX`: expect 429. The limiter counts successful and failed login requests; restart the API or wait for its window before more manual attempts.
4. Use an API client to log in, retain the response cookie in its cookie jar, then send a DELETE with the configured `Origin` header. Login also requires that Origin. An agent gets 403 and the order stays. An admin gets 204 and the order is removed. Use a disposable record; reseeding restores a deleted deterministic seed order.
5. Repeat without a cookie or with an expired JWT cookie (keeping the trusted Origin): expect 401. Mutations with an untrusted or missing Origin return 403. `?token=...` alone must not authenticate. The automated suite also covers forged signatures, the wrong algorithm and malformed claims.

### Verification and limits

`npm test` in `server/` builds the server and runs nine security scenarios within one integration test (10 reported tests). It creates a uniquely named `orders_console_auth_test_*` database on the configured MongoDB server and drops only that database afterward; seeded application data is not changed. All 10 tests and the client production build passed during Phase 2.

The application database was empty at the end of Phase 2 (zero users and orders), so a login using the environment's seed credentials returned 401. Run `npm run seed` in `server/` before manual login. No application data was seeded or deleted during this phase.

The rate limiter uses process memory, resets on restart and is not shared across servers. Express does not trust forwarded IP headers; through the local Vite proxy clients may share a limiter bucket. Authentication has no refresh or revocation service; expired tokens require login again, and the UI discovers expiration on its next authenticated request. Cookie migration verification: 26 reported backend tests and seven Playwright browser tests passed, as did both builds. Browser tests mock API responses; backend tests exercise real Express and MongoDB independently.
