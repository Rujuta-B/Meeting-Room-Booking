# Meeting Room and Resource Booking

A POC for the "React to Full Stack — 101" learning path. Users search for a meeting
room by time/capacity/equipment, book it, and the system guarantees a room can
never be double-booked — even when two requests arrive at the exact same instant.

## Problem this solves

Rooms get double-booked, recurring bookings block rooms nobody uses, and there's
no way to find a free room at short notice. This app fixes all three: a real
availability search over booking data, a database-enforced guarantee that
overlapping bookings for the same room can't both succeed, and a schema where
cancelling one occurrence of a recurring series never touches the rest of it.

## Stack

- **Backend** (`api/`): Express + TypeScript + PostgreSQL + Prisma
- **Frontend** (`web/`): React + Vite
- Both run together via a single `docker compose up`

## Running it

```bash
cp .env.example .env
cp api/.env.example api/.env
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3000
- The `api` container runs `prisma migrate deploy` on startup — the database is
  fully migrated by the time you can reach either URL.

Seed some sample rooms/users (run once, after the stack is up):

```bash
docker compose exec api npm run prisma:seed
```

This creates `admin@example.com` / `AdminPass123` (an ADMIN user), `user@example.com`
/ `UserPass123` (a regular user), and three rooms with different capacities and
equipment attributes.

**Caveat:** Vite bakes `VITE_API_URL` into the frontend's JS bundle at *build*
time, not read at container start. If you change `api/.env`'s `WEB_ORIGIN` or the
`VITE_API_URL` build arg in `docker-compose.yml`, run `docker compose up --build`
again — a plain `docker compose up` will keep serving the previously-baked URL.

## Running the backend test suite

The tests need a real Postgres database (not mocked — see "Why an EXCLUDE
constraint" below for why that matters):

```bash
cd api
cp .env.test.example .env.test   # edit DATABASE_URL if needed
docker compose up -d db          # from the repo root, or point at any local Postgres
docker compose exec db createdb -U booking_app booking_test
npm install
npm test
```

The centerpiece test, `tests/bookings.concurrency.test.ts`, fires two identical
overlapping booking requests concurrently (`Promise.all`, not sequential
`await`s) and asserts exactly one succeeds (`201`) and the other is rejected as
a conflict (`409 BOOKING_CONFLICT`).

## Architecture and key decisions

### The double-booking guarantee: a PostgreSQL `EXCLUDE` constraint

The core requirement of this POC is: two people booking the same room for an
overlapping time must not both succeed, even when the requests arrive at the
exact same instant. This is solved with a database constraint, not application
code:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status = 'CONFIRMED');
```

(`api/prisma/migrations/20260101000001_add_booking_exclusion_constraint/migration.sql`)

This tells Postgres: no two `CONFIRMED` rows may exist for the same `room_id`
with overlapping time ranges — enforced by the table itself, on every insert
and update, regardless of which code path wrote the row.

**Why this over the two other reasonable approaches:**

- **vs. a `SERIALIZABLE` transaction + retry-on-conflict**: this only detects
  the conflict at *commit* time, via a serialization failure the application
  then has to catch and retry — reimplementing, in application code, something
  Postgres already does natively and more cheaply as a constraint.
- **vs. row locking (`SELECT ... FOR UPDATE`)**: this only protects concurrent
  writers that go through the *same code path* and remember to take the lock.
  Any future script, admin tool, or bug that inserts into `bookings` without
  locking silently reintroduces double-booking. It's only as safe as every
  caller's discipline.

An `EXCLUDE` constraint is enforced by the table itself, unconditionally, for
every writer, forever. It also raises one single, well-known Postgres error
code (`23P01`, `exclusion_violation`) that the app catches in exactly one place
(`api/src/middleware/errorHandler.ts`) and translates into a clean `409
BOOKING_CONFLICT` response.

Because of this design, `api/src/modules/bookings/bookings.service.ts` does
**not** check "is this slot free?" before inserting — it just attempts the
insert and lets Postgres decide. A check-then-insert pattern would have a race
window between the check and the insert where two concurrent requests could
both pass the check; there is no such window here, because there is no check.

### Why the double-booking guarantee is tested with real concurrency, not mocks

`tests/bookings.concurrency.test.ts` runs against a real Postgres test
database and fires two HTTP requests via `Promise.all` (not two sequential
`await`s). A sequential test would let the first request's entire lifecycle —
including its `INSERT` actually committing — finish before the second begins,
which would only prove the constraint stops a *later* insert from conflicting
with an already-committed one. `Promise.all` fires both requests without
awaiting in between, so both `INSERT`s reach Postgres at effectively the same
time — the actual race condition being guarded against.

### Recurring bookings: independent occurrences, not one row per series

`BookingSeries` holds only descriptive metadata (owner, room, day of week,
time of day, occurrence count) — **no time range or status of its own**. Each
occurrence is its own row in `bookings`, with a nullable `seriesId` pointing
back to the series.

This means cancelling one occurrence is a single-row `UPDATE` on that
occurrence's own `bookings` row — there is structurally nothing on
`BookingSeries` that a single-occurrence cancellation could touch. See
`tests/bookings.series.test.ts` for a test that creates an 8-week series,
cancels one occurrence in the middle, and confirms every sibling occurrence
and the series row are untouched.

### Cancelling: soft-delete, and why the constraint has to be partial

A booking is never `DELETE`d — cancelling sets `status = 'CANCELLED'` and the
row stays forever, as an audit trail (see "Structured logging" below). This is
*why* the `EXCLUDE` constraint above has a `WHERE (status = 'CONFIRMED')`
clause: without it, a cancelled row would still count as occupying its slot
forever, breaking "freed time must be immediately bookable." A **partial**
exclusion constraint re-evaluates row membership on every `UPDATE`, so the
moment a booking's status flips away from `CONFIRMED`, it drops out of the
constraint's view — the very next request for that same room+time succeeds,
with no extra "release the lock" step.

### Shortening an already-started booking

**Rule:** if a booking's `startTime` is in the past relative to "now," it can
no longer be shortened or cancelled — the API returns
`409 BOOKING_ALREADY_STARTED`. Once a meeting has started, retroactively
changing its time window is both meaningless (the room was physically in use)
and would corrupt the audit trail and the utilisation report, both of which
assume `CONFIRMED` bookings reflect what actually happened. This is a
service-layer check (`api/src/modules/bookings/bookings.service.ts`), not a
database constraint — "now" isn't a static property of a row that Postgres
should enforce.

### Availability search and the utilisation report: raw SQL, on purpose

Both `api/src/modules/rooms/rooms.service.ts` (search) and
`api/src/modules/utilisation/utilisation.service.ts` (the admin aggregate
report) use `prisma.$queryRaw`, not Prisma's query builder. Two real
limitations of the builder force this:

- "Rooms with no `CONFIRMED` booking overlapping this exact window" is a
  correlated `NOT EXISTS` using Postgres's range-overlap operator (`&&`) —
  Prisma's builder has no way to express range overlap at all.
- The utilisation report groups by `date_trunc('week', start_time)` — grouping
  by a *computed expression*, not a stored column, which Prisma's `groupBy()`
  API cannot do.

Building either through the query builder would mean fetching rows and
filtering/grouping in application code — exactly the "client-side filter"
anti-pattern the spec forbids. Both queries are backed by indexes
(`bookings(room_id, status, start_time, end_time)`, `room_attributes(attribute_id)`)
ready to `EXPLAIN ANALYZE`.

### Auth: JWT access + refresh pair, httpOnly cookie

Login/register return a short-lived **access token** in the JSON response body
and set a longer-lived **refresh token** as an `httpOnly`, `Secure` (in
production), `SameSite=Strict` cookie scoped to `Path=/auth` (so it reaches
both `/auth/refresh`, to be read, and `/auth/logout`, to be revoked — but no
other route) — never in the response body. The access token lives only in the frontend's memory
(`web/src/api/client.js`'s module-level variable), never in `localStorage` or a
JS-readable cookie.

**Why split this way:** a token in `localStorage` or a plain cookie can be read
by any script running on the page — including an injected XSS payload. An
`httpOnly` cookie cannot be read by JavaScript at all, so the refresh token
(the one that needs to survive for days) is immune to that specific attack
even if the page were compromised. The access token is still technically
readable by an XSS payload while it lives in memory, but it's short-lived
(minutes), which bounds how long a stolen one is useful for. Refresh tokens
also rotate on every use (`api/src/modules/auth/auth.service.ts`) — each
refresh revokes the token just used and issues a new one, so a stolen-and-
replayed old refresh token is detectable (the legitimate user's next refresh
attempt fails, a signal of compromise) rather than silently reusable forever.

Because the access token lives only in memory, it's lost on every hard
refresh — the frontend compensates by calling `POST /auth/refresh` once on
app mount (`web/src/auth/AuthContext.jsx`), using the httpOnly cookie that
*did* survive the reload, to silently recover a session before rendering any
route.

### Authorization: server-enforced, not just hidden buttons

Every booking mutation checks `booking.userId === req.user.id` server-side
(`api/src/modules/bookings/bookings.service.ts`) before allowing a
cancel/shorten — including when a user reaches someone else's booking
directly by its ID. `tests/bookings.ownership.test.ts` proves this with real
HTTP requests: user B calling `DELETE /bookings/:id` on user A's booking gets
a `403`, not a UI restriction that a direct API call would bypass. The
frontend's route guards (`web/src/auth/RequireAuth.jsx`,
`RequireAdmin.jsx`) are explicitly documented in their own code as **UX only,
not security** — a user can bypass them by editing React state or calling the
API directly; the backend's checks are the only real enforcement.

### Structured logging

Every booking creation, cancellation, and rejected double-booking attempt logs
a structured (JSON, via `pino`) event with the user id, room id, time range,
and outcome, tagged with a per-request id (`api/src/middleware/requestId.ts`).
This is the audit trail for disputes like "the system let someone else book my
room."

## API surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | — | |
| POST | `/auth/login` | — | |
| POST | `/auth/refresh` | httpOnly cookie | |
| POST | `/auth/logout` | httpOnly cookie | |
| GET | `/rooms` | user | |
| GET | `/rooms/search` | user | `?startTime&endTime&minCapacity&attributes` |
| POST | `/rooms` | admin | |
| PATCH | `/rooms/:id` | admin | |
| POST | `/bookings` | user | |
| GET | `/bookings/me` | user | |
| DELETE | `/bookings/:id` | user, owner only | |
| PATCH | `/bookings/:id/shorten` | user, owner only | |
| POST | `/bookings/series` | user | creates N weekly occurrences atomically |
| DELETE | `/bookings/:id/occurrence` | user, owner only | cancels one occurrence, not the series |
| GET | `/utilisation` | admin | `?rangeStart&rangeEnd` |

Error responses are always `{ error: { code, message, ... } }` — the frontend
switches on `code` (e.g. `BOOKING_CONFLICT`, `VALIDATION_ERROR`,
`BOOKING_ALREADY_STARTED`, `FORBIDDEN`, `NOT_FOUND`), never on message text.

## Folder layout

```
poc-practice/
├── docker-compose.yml   # orchestrates db + api + web
├── api/                 # Express + Prisma + PostgreSQL backend
└── web/                 # React + Vite frontend
```

Two independently-deployable sibling apps, not nested — see the top comments
in `docker-compose.yml` and `api/src/app.ts` for more on why.
