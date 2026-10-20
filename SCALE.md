# Scale Memo — 5 Million Orders

**Context:** Three developers support agents in two countries. I would measure real query latency, traffic, and availability requirements before adding infrastructure. Five million orders alone does not justify a rewrite.

## What I would change

- **Pagination and search:** Move from deep offset pagination to cursor pagination using the sort value and `_id`. Review MongoDB query plans and indexes for actual filter/sort patterns. Avoid expensive exact counts on every request unless agents need them. The current text search is not a general substring search.
- **Reliability and operations:** Add basic p95 latency/error monitoring, tested database backups and restores, and a replica set if uptime requirements justify it. Verify write durability and retry uncertain order-creation results using the same idempotency key.
- **Deletion and audit:** Replace hard-delete with a retention policy that preserves idempotency evidence; add audit records for sensitive actions. Agree on retention and recovery requirements with operations first.
- **Two-country usage:** Measure latency from both countries, confirm data-residency requirements, use HTTPS and Secure cookies, and present dates in users' timezones. Avoid multi-region writes unless measurements justify them.

## What I would keep

Keep the React + TanStack Query frontend, request cancellation and query-key isolation, server-side pagination, Zod validation, and integer-cent amounts. Keep the Express monolith and MongoDB/Mongoose: a three-person team can maintain this simpler architecture. Preserve the atomic unique-index idempotency approach and its concurrency test.

## What I would refuse to build without evidence

I would not introduce microservices, sharding, Kafka, Redis, or active-active multi-region writes just because the collection reached five million records. I would also refuse an unrestricted “delete all cancelled orders” feature without agreed scope, retention, and recovery rules, or a promise of permanent deduplication while order records and their keys can be deleted.
