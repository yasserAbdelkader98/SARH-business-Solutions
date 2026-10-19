# Orders Console

Phase 1: React/Vite/TypeScript client, Express/TypeScript API, local MongoDB with Mongoose, models and seed data. Authentication and order endpoints are not implemented yet.

## Local setup

Requires Node.js 22.12+ and a running local MongoDB 8 instance (no Docker or hosted services).

```sh
cd server
npm install
npm run setup
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

Each app has its own `.env` and `.env.example`. The server's `setup` script creates `server/.env` only if missing. The client copy command is needed only when `client/.env` does not exist; it refuses to overwrite an existing file. Review `MONGODB_URI` and `PORT` in `server/.env` before seeding. Set `CLIENT_PORT` and `API_PORT` in `client/.env`; `API_PORT` must match the server's `PORT`. Database credentials and seed passwords belong only in `server/.env`. Only the `.env.example` files belong in source control. The example passwords are public local demo credentials, not real secrets.

If MongoDB is installed but not running, create a local data directory and run this in another terminal from the project root:

```sh
node -e "require('node:fs').mkdirSync('.local/mongodb', { recursive: true })"
mongod --dbpath .local/mongodb --bind_ip 127.0.0.1 --port 27017
```

In PowerShell, if `mongod` is not on PATH, use its installed path, for example `& "C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe"` with the same arguments. MongoDB data under `.local/` is ignored by Git.

Open http://localhost:5173. The setup page checks `/api/health` through Vite's development proxy. The API is at http://localhost:3000/api/health and returns `{"status":"ok","database":"connected"}`. It starts listening only after MongoDB connects and indexes are ready; a lost connection returns HTTP 503 once detected by the driver.

## Commands

| Directory | Command | Purpose |
| --- | --- | --- |
| `server/` | `npm run setup` | Create missing `server/.env` |
| Each directory | `npm install` | Install that app's dependencies |
| Each directory | `npm run dev` | Run that app with reload |
| `server/` | `npm run seed` | Insert missing demo users and 50,000 seed orders |
| Each directory | `npm run typecheck` | Check that app's TypeScript |
| Each directory | `npm run build` | Build that app |
| `server/` | `npm start` | Run the built API only |

The frontend build is `client/dist`; serving/deploying it is outside Phase 1. JWT will be added with authentication rather than installed unused here.

## Seed data

The script uses 1,000-order batches and deterministic ObjectIds with `$setOnInsert`. Rerunning inserts missing records without changing existing orders, timestamps, passwords, or roles. Interrupted runs can be resumed. It never clears collections. Run one seed process at a time; concurrent seed runs may report duplicate-key errors and can be rerun sequentially.

Orders have 1–5 items, varied names, emails, statuses, prices and quantities, and fixed dates between October 2025 and October 2026. Emails use the reserved example.com domain. `unitPrice` and `totalAmount` are integer minor currency units (e.g. 2499 means 24.99); totals equal the sum of quantity × unit price. The seed is synthetic, not customer data.

Defaults from `server/.env.example`:

| Role | Email | Password |
| --- | --- | --- |
| admin | admin@example.com | AdminDemo123! |
| agent | agent@example.com | AgentDemo123! |

Passwords are hashed with bcrypt (cost 12). These users cannot log in yet. Changing `.env` passwords does not reset existing users; changing email addresses creates additional users.

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

Login/JWT, route authorization, orders API/UI, R1 stale-request protection, R2 duplicate-request proof, and final assessment documentation/screenshots are deferred to their requested phases. No optional assessment features or deployment are included. This phase has no automated test suite; type checking, builds and database/runtime checks are reported separately.

## Phase 1 checks performed

- `npm run typecheck` and `npm run build` passed.
- Two `npm run seed` runs against a fresh local MongoDB: 50,000 inserted, then 0 inserted; total stayed 50,000.
- A database verification script inspected all 50,000 orders: item counts 1–5, all four statuses present, exact item totals, and preserved seed timestamps. It checked both users' passwords against their bcrypt hashes and confirmed all seven order indexes (including `_id`).
- Direct and Vite-proxied health requests returned HTTP 200 with connected status; the frontend HTML returned HTTP 200.
- Browser rendering and the database-disconnection UI flow have not been manually verified.
