# Decisions in progress

These are Phase 1 notes, not the final three-decision submission. R2's required decision will be written when implemented.

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

The optional idempotency key uses a [MongoDB partial unique index](https://www.mongodb.com/docs/manual/core/index-partial/) covering strings, so multiple documents can omit the key. Server retry handling remains R2 work.

## AI disclosure

After Phase 1 review, the client and server use independent npm packages instead of a root workspace, as requested. This removes the root manifest and concurrently dependency; development now uses two terminals. Each app has its own `.env` and `.env.example`. The client stores only development ports; database credentials stay on the server. The client's `API_PORT` must be kept in sync with the server's `PORT`.

Codex assisted with Phase 1 scaffolding, schemas, seed generation, documentation and verification commands. The candidate must review and understand these choices before the final submission and live interview.
