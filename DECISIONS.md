# Engineering Decisions

## 1. R2 — Idempotency Strategy

- **Decision:** Use a client-generated UUID idempotency key, a canonical request hash, and an atomic MongoDB insert protected by a unique index.
- **Alternative:** Store idempotency records separately from orders in a dedicated collection.
- **Why rejected:** A separate collection introduces coordination, transaction, and recovery complexity unnecessary for this assessment.
- **Trade-off:** Retries with the same key, normalized payload and user return the existing order; changed data or a different user returns `409 Conflict`.
- **Retry handling:** If the winning insert is not yet visible, retry primary reads up to five times, then return `503` and require the same key/payload on retry.
- **Limitations:** The guarantee applies to requests sharing the same key while its indexed record exists. Hard deletion removes the stored key, and external side effects are not covered.
- **Reasoning:** The database enforces uniqueness even when multiple requests reach the server concurrently, without relying on frontend button state.

## 2. Database — MongoDB + Mongoose

- **Decision:** Use MongoDB with Mongoose, embedding each order's 1–5 line items in a single document.
- **Alternative:** PostgreSQL with relational order and line-item tables.
- **Why rejected:** MongoDB + Mongoose was specified in the project plan; switching databases would add work without addressing an unmet requirement in this slice.
- **Trade-off:** Embedded items simplify reads and allow atomic single-document creation without multi-document transactions.
- **Performance:** Status-prefixed date/amount indexes support filtered sorting; lean queries and field projection reduce list-response overhead.
- **Limitations:** MongoDB lacks relational foreign keys; name search uses text phrases and email search uses exact matching, with separate sorting over search matches.

## 3. R1 — Pagination and Request Management

- **Decision:** Use server-side offset pagination with 25 orders per page, sorting by date/amount plus `_id` as a tie-breaker, and TanStack Query.
- **Alternative:** Cursor-based pagination using the sort field and order ID.
- **Why rejected:** Offset pagination keeps page numbers and exact totals straightforward for this assessment; the current UI exposes Previous/Next navigation.
- **Performance:** The API returns at most 25 projected rows; search waits 600 ms and filter/sort changes reset the page to 1.
- **Correctness:** Query keys include user and all list parameters, isolating old responses even if cancellation fails; AbortSignal also cancels obsolete fetches.
- **Limitations:** Deep offsets and exact counts become expensive; parallel count/list queries are not a snapshot. Cursor pagination would be reconsidered as usage grows.

## AI Usage Disclosure

I used OpenAI Codex as a development assistant throughout this project. It helped with project setup, code generation, debugging, testing, and documentation.

I guided the implementation requirements and technical decisions, reviewing the generated code and validating the application's functionality through testing.
