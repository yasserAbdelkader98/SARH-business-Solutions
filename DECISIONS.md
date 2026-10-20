# Decisions in progress

These are working notes, including the required R2 decision. The final submission should consolidate them into three decisions.

## Seed safely without resetting the database

Use deterministic seed ObjectIds and batched `$setOnInsert` upserts.
A rerun restores missing seed records while preserving existing data and timestamps.
The alternative was clearing collections before inserting 50,000 orders.
That is simpler but destroys manually created data and makes interrupted runs inconvenient.
Batching 1,000 operations bounds memory use and reduces database round trips.
Seed runs are sequential local setup operations, not a concurrent import service.

## Money and initial indexes

Store amounts in integer minor currency units so quantity × price totals stay exact.
Decimal128 was considered but adds serialization and arithmetic complexity for this small app.
Use date/amount indexes with `_id` tie breakers, with separate status-prefixed versions.
Use MongoDB's built-in text index initially; arbitrary substring search is not promised.
Extra search infrastructure is outside the local-only assessment scope.
Confirm query plans and search behavior during R1 rather than claiming performance now.

The idempotency key uses a [MongoDB partial unique index](https://www.mongodb.com/docs/manual/core/index-partial/) covering strings, so seed documents can omit the key. API creation requires it.

## Authentication update: short-lived JWTs in HttpOnly cookies

Store the JWT in a host-only HttpOnly, SameSite=Strict cookie, with Secure enabled in production.
This replaces the earlier memory/Bearer approach at the user's request and allows session restoration after reload through GET /api/me.
React stores only the user profile; logout calls the server to clear the cookie before clearing local state.
All mutations require an exact configured Origin as an additional CSRF defense; API scripts must send it too.
Use the same origin for frontend and API through a proxy, avoiding unnecessary CORS configuration.
HttpOnly prevents JavaScript from reading the token, but active XSS can still act as the user.
No refresh or revocation service is added; copied JWTs remain valid until expiry.
Check the database user and role on each authenticated request so role changes take effect immediately.
This costs one indexed user lookup; a token-only role check would be cheaper but stale until expiry.
Use a simple per-process login limiter rather than a shared service for this single-server local app.

## Phase 3: indexed search and numbered pages

Use 25-row offset pages with exact counts because the requested UI has numbered pages.
Cursor pagination was considered; it handles deep pages and changing data better but complicates page navigation.
Sort by the chosen field and `_id` in the same direction to make ties deterministic.
Use the existing text index for quoted name phrases and a new email index for exact full-email matches.
Multi-word names match the phrase together, avoiding MongoDB's default OR behavior.
Substring regex search was rejected because it could scan all 50,000 documents.
Broad text matches still require sorting and exact counts; counts and rows are not a transactional snapshot.
Keep all filters in the query key, pass AbortSignal to fetch, and avoid retaining previous-filter rows.

## R2: atomic insertion with a unique operation key

Insert the complete order, UUID key and canonical SHA-256 hash as one document under a unique key index.
A pre-insert findOne followed by create was rejected because simultaneous requests can both observe no order.
On duplicate-key errors, compare the normalized payload/user hash and return the stored order or 409.
Briefly retry a missing winner lookup; otherwise return 503 and require the same key on retry.
Keep the exact submitted payload/key in per-user sessionStorage so same-tab reloads can recover it; authentication tokens stay in the HttpOnly cookie.
Integer-cent totals are recalculated on the server, and the list refreshes only after confirmed success.
The guarantee lasts while the keyed record exists; hard-delete, cleared client storage and intentionally new keys are explicit limits.

## AI assistance

After Phase 1 review, the client and server use independent npm packages instead of a root workspace, as requested. This removes the root manifest and concurrently dependency; development now uses two terminals. Each app has its own `.env` and `.env.example`. The client stores only development ports; database credentials stay on the server. The client's `API_PORT` must be kept in sync with the server's `PORT`.

Codex assisted with scaffolding, schemas, seed generation, authentication, the login screen, orders list and create form, idempotency handling, security/concurrency/browser tests, documentation and verification commands. The candidate must review and understand these choices before the final submission and live interview.
