import postgres from "postgres";

// Postgres via DATABASE_URL — point it at Supabase's connection string in prod.
// prepare:false so it works behind Supabase's transaction pooler too.
// Numeric/date/timestamp come back as plain number/string like the old SQLite layer.
let _sql: postgres.Sql | null = null;

export function sql(): postgres.Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = postgres(url, {
    prepare: false,
    onnotice: () => {}, // silence "already exists, skipping" from idempotent DDL at startup
    connection: process.env.DB_SCHEMA ? { search_path: process.env.DB_SCHEMA } : undefined,
    types: {
      numeric: { to: 0, from: [1700], serialize: (v: unknown) => String(v), parse: parseFloat },
      date: { to: 0, from: [1082], serialize: (v: unknown) => String(v), parse: (v: string) => v },
      timestamptz: { to: 0, from: [1184, 1114], serialize: (v: unknown) => String(v), parse: (v: string) => v },
    },
  });
  return _sql;
}

export type Tx = postgres.Sql | postgres.TransactionSql;

export async function ensureSchema() {
  const s = sql();
  if (process.env.DB_SCHEMA) {
    await s.unsafe(`CREATE SCHEMA IF NOT EXISTS ${process.env.DB_SCHEMA}`);
  }
  await s.unsafe(SCHEMA);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS owners (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dorms (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id           bigint NOT NULL REFERENCES owners(id),
  name               text NOT NULL,
  address            text,
  promptpay_id       text,
  bank_name          text,
  bank_account_no    text,
  bank_account_name  text,
  water_rate         numeric(12,2) NOT NULL DEFAULT 9,
  electric_rate      numeric(12,2) NOT NULL DEFAULT 4.75,
  service_fee        numeric(12,2) NOT NULL DEFAULT 10,
  trash_fee          numeric(12,2) NOT NULL DEFAULT 20,
  wifi_fee           numeric(12,2) NOT NULL DEFAULT 100,
  due_in_days        integer NOT NULL DEFAULT 7,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dorm_id       bigint NOT NULL REFERENCES dorms(id),
  room_no       text NOT NULL,
  room_no_norm  text NOT NULL,
  base_rent     numeric(12,2) NOT NULL DEFAULT 0,
  wifi_fee      numeric(12,2),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_room_norm ON rooms(dorm_id, room_no_norm);

CREATE TABLE IF NOT EXISTS tenants (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id       bigint NOT NULL REFERENCES rooms(id),
  full_name     text NOT NULL,
  phone         text,
  line_user_id  text,
  is_active     integer NOT NULL DEFAULT 1,
  moved_in_at   date,
  moved_out_at  date,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_line ON tenants(line_user_id) WHERE line_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_room_active_tenant ON tenants(room_id) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS meter_readings (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id           bigint NOT NULL REFERENCES rooms(id),
  period            text NOT NULL,
  reading_date      timestamptz NOT NULL DEFAULT now(),
  water_previous    numeric(12,2) NOT NULL,
  water_current     numeric(12,2) NOT NULL,
  water_usage       numeric(12,2) NOT NULL,
  electric_previous numeric(12,2) NOT NULL,
  electric_current  numeric(12,2) NOT NULL,
  electric_usage    numeric(12,2) NOT NULL,
  meter_reset       integer NOT NULL DEFAULT 0,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, period)
);

CREATE TABLE IF NOT EXISTS invoices (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dorm_id        bigint NOT NULL REFERENCES dorms(id),
  room_id        bigint NOT NULL REFERENCES rooms(id),
  tenant_id      bigint REFERENCES tenants(id),
  period         text NOT NULL,
  invoice_no     text NOT NULL UNIQUE,
  tenant_name    text,
  tenant_phone   text,
  room_no        text NOT NULL,
  issue_date     date,
  due_date       date,
  total          numeric(12,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'draft',
  supersedes_id  bigint REFERENCES invoices(id),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_active ON invoices(room_id, period) WHERE status <> 'void';

CREATE TABLE IF NOT EXISTS invoice_items (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id       bigint NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  description      text NOT NULL,
  quantity         numeric(12,2),
  unit_price       numeric(12,2),
  amount           numeric(12,2) NOT NULL,
  meter_reading_id bigint REFERENCES meter_readings(id)
);
CREATE INDEX IF NOT EXISTS ix_items_invoice ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id  bigint NOT NULL REFERENCES invoices(id),
  amount      numeric(12,2) NOT NULL,
  method      text NOT NULL,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pay_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS ix_pay_paidat ON payments(paid_at);

CREATE TABLE IF NOT EXISTS complaints (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dorm_id       bigint NOT NULL REFERENCES dorms(id),
  room_id       bigint REFERENCES rooms(id),
  reporter_name text NOT NULL,
  phone         text,
  line_user_id  text,
  topic         text NOT NULL,
  detail        text NOT NULL,
  status        text NOT NULL DEFAULT 'new',
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Everyone who messages the LINE OA, captured by the webhook so the owner can
-- bind a tenant to a LINE account from the UI without the tenant typing commands.
-- ponytail: one OA per install — no dorm scoping.
CREATE TABLE IF NOT EXISTS line_contacts (
  line_user_id text PRIMARY KEY,
  display_name text,
  last_seen    timestamptz NOT NULL DEFAULT now()
);

-- Supabase exposes the public schema via PostgREST; RLS with no policies blocks
-- anon/authenticated API access. The app connects as table owner and is unaffected.
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorms ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_contacts ENABLE ROW LEVEL SECURITY;
`;
