@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

หอพร้อม (HorProm) — a Thai dormitory management web app: rooms/tenants, meter readings that auto-generate invoices, PromptPay QR payment, payment tracking, repair tickets, and a live LINE integration (push + webhook). It replaces the Google Apps Script system in `../Version Excel/` (keep that around as domain reference only). All user-facing text is Thai; schema and code are English.

## Commands

```bash
npm run dev            # dev server on :3000
npm run build          # production build (also the fastest full typecheck+lint gate)
npm start              # serve production build
npx tsc --noEmit       # typecheck only
npm run selfcheck      # billing-engine tests against the real DB (uses isolated "selfcheck" schema, drops/recreates it)
npm run seed           # demo data: demo@horprom.test / password12345 (no-op if already seeded)
npm run richmenu       # LINE rich menu: -- <image.png> creates+sets default, -- --generate renders scripts/richmenu.png, -- --delete-all
```

All of these need `DATABASE_URL` from `.env.local` (dotenv is loaded by Next automatically; for the scripts run `export $(grep -v '^#' .env.local | xargs)` first). The DB is Supabase Postgres (Singapore); the password in DATABASE_URL is URL-encoded (`!` → `%21`) — keep it that way. **The Supabase DB holds real production data** (the owner's live account uses the deployed app) — never point tests at it; use forged-session smoke tests read-only, and selfcheck's isolated schema for writes. `data/horprom.db` is a stale SQLite snapshot from the brief 2026-07-05 SQLite experiment — ignore it.

**Deployment** — Vercel project `horprom`, production at **https://horprom.vercel.app** (the owner actively uses it), functions pinned to Singapore via `vercel.json` `regions: ["sin1"]` (next to the DB — don't remove). Deploy with `npx vercel --prod`. Production env vars live on Vercel (`npx vercel env ls production`); its `DATABASE_URL` uses the **Supavisor pooler** (`postgres.eyiatmxlfyctgtxwjgbi@aws-1-ap-southeast-1.pooler.supabase.com:6543`) because Vercel has no IPv6 route to Supabase's direct host — local dev keeps the direct connection.

There is no test framework. `scripts/selfcheck.mts` is assert-based and is the regression gate for anything touching `lib/billing.ts` — extend it when you change billing logic.

## Architecture

**Data layer** — raw SQL via postgres.js tagged templates, no ORM. `lib/db.ts` exports `sql()` (singleton) and `ensureSchema()` (idempotent DDL, executed at server start by `instrumentation.ts`). There is no migration tool: the DDL is `CREATE TABLE IF NOT EXISTS`, so column changes on an existing DB need a manual `ALTER TABLE` run against Supabase *and* the DDL updated to match. Custom type parsers make `numeric` come back as JS number and `date`/`timestamptz` as strings — code compares dates as `YYYY-MM-DD` strings; don't switch these to Date objects. `DB_SCHEMA` env var redirects everything to another Postgres schema (how selfcheck isolates itself). Every table gets `ENABLE ROW LEVEL SECURITY` in the DDL with **no policies**: this blocks Supabase's PostgREST/anon API while the app (connecting as table owner) is unaffected — new tables must follow this pattern; `prepare: false` is set for pooler compatibility.

**Billing core** (`lib/billing.ts`) — the invariants that must not break:
- Invoices store only lifecycle status `draft | issued | void`. Paid/partial/overdue are **derived at read time** from `SUM(payments.amount)` (`deriveStatus`) — never persist a payment status.
- Corrections are void + reissue: never edit an issued invoice; the replacement gets `supersedes_id` and an invoice_no `-R{n}` suffix. The partial unique index (`WHERE status <> 'void'`) allows one live invoice per room+period.
- Meter readings upsert on `(room_id, period)` so re-entering a corrected reading after voiding works; previous meter values are snapshotted into the row, never re-derived.
- `createReadingAndInvoice` is one transaction: reading upsert → invoice → items (water/electric lines carry `meter_reading_id`) → total.
- Invoice `amount` may legitimately differ from `quantity × unit_price` (owner overrides) — no CHECK constraint enforcing it, on purpose.

**Auth** — `lib/auth.ts`: bcrypt + HMAC-signed cookie (`SESSION_SECRET`), no session table, no auth library. `getOwner` is wrapped in React `cache()` so layout + page share one query per request. Owner-facing server actions live in `app/actions.ts` and every one scopes queries by the caller's dorm (`getDorm()` — implemented as cached `getDormCached` in `lib/dorm.ts` because "use server" files may only export async functions).

**Tenant-facing surface** (`app/t/*`) — no login; the trust boundary is a stateless HMAC-signed token with expiry (`signPayload`/`verifyPayload` in `lib/util.ts`). `app/t/actions.ts` re-verifies the token server-side. PromptPay QR (`lib/qr.ts`) is computed locally from the dorm's PromptPay ID — no bank API.

**LINE** (`lib/line.ts`, `app/api/line/webhook/route.ts`) — live: `LINE_CHANNEL_ACCESS_TOKEN` in `.env.local` is the working token carried over from the GAS system (treat as secret). `lib/line.ts` is pure LINE (no DB): push/reply helpers + flex builders (invoice bubble with real line items, open-page card). The webhook handles follow, text commands (ลงทะเบียน/id/บิล), and rich-menu postbacks (`ACTION_ID`/`ACTION_REGISTER`/`ACTION_LATEST_INVOICE`/`ACTION_COMPLAINT` — same codes as the GAS menu, so either webhook can serve the same rich menu during cutover). It must always return HTTP 200. Verification: `x-line-signature` when `LINE_CHANNEL_SECRET` is set, else GAS-style `?token=` (`LINE_WEBHOOK_VERIFY_TOKEN`). Re-registering moves the binding (clears the LINE id from any other tenant first — `ux_tenant_line` is unique). `LINE_ADMIN_USER_ID` (optional) gets a push on new complaints. `NEXT_PUBLIC_BASE_URL` is already set on Vercel; the one remaining cutover step is a user action: point the LINE Developers webhook at `https://horprom.vercel.app/api/line/webhook?token=<LINE_WEBHOOK_VERIFY_TOKEN>` (until then the GAS webhook still serves; rich-menu codes are compatible with both).

## Performance constraint

The DB is remote (~30ms RTT from Vercel sin1 / Thailand; was 240ms when the project was misplaced in Sydney). Every sequential `await sql()` adds a round trip, so pages fire independent queries with `Promise.all` (see dashboard) and per-request caches dedupe auth/dorm lookups. Keep round trips per page low.

Navigation is stale-while-revalidate: `experimental.staleTimes` in `next.config.ts` keeps the client Router Cache for 5 min, so page changes paint the cached page instantly (no fetch, no `loading.tsx` skeleton — that file now only covers cold loads). `components/auto-refresh.tsx`, mounted once in `app/(app)/layout.tsx`, calls `router.refresh()` on every pathname change and every 10s, streaming fresh data in behind the cached paint. Server actions' `revalidatePath` purges the client cache, so mutations still show instantly. Don't re-add per-page `<AutoRefresh>`; note `next.config.ts` changes need a dev-server restart (not hot-reloaded).

## Gotchas

- Room numbers are matched on `room_no_norm` (`normalizeRoomNo`: trims, uppercases, converts Thai digits ๐-๙). Always insert/search rooms through it.
- Months are displayed in Thai Buddhist era via `fmtPeriod`; periods are stored as `'YYYY-MM'` text.
- `tenants.line_user_id` must start with `U` and is unique; at most one active tenant per room (partial unique index).
- Next.js 16: `params`/`searchParams` are Promises, `cookies()` is async — see AGENTS.md note above about reading bundled docs before writing framework code.
