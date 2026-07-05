// Billing-engine self-check against Postgres. Run: npm run selfcheck
// Uses an isolated schema (dropped and recreated each run) via DB_SCHEMA.
import assert from "node:assert";

process.env.DB_SCHEMA = "selfcheck";

const { sql, ensureSchema } = await import("../lib/db");
const { createReadingAndInvoice, issueInvoice, voidInvoice, getInvoice, deriveStatus } =
  await import("../lib/billing");

const s = sql();
await s.unsafe("DROP SCHEMA IF EXISTS selfcheck CASCADE");
await ensureSchema();

await s`INSERT INTO owners (email, password_hash, display_name) VALUES ('a@b.c', 'x', 'test')`;
await s`INSERT INTO dorms (owner_id, name) VALUES (1, 'หอทดสอบ')`;
const dorm = (await s`SELECT * FROM dorms WHERE id = 1`)[0] as never as Parameters<typeof createReadingAndInvoice>[0]["dorm"] & { due_in_days: number };
await s`INSERT INTO rooms (dorm_id, room_no, room_no_norm, base_rent) VALUES (1, '101', '101', 3000)`;
const room = (await s`SELECT * FROM rooms WHERE id = 1`)[0] as never as Parameters<typeof createReadingAndInvoice>[0]["room"];
await s`INSERT INTO tenants (room_id, full_name, phone) VALUES (1, 'สมชาย', '0812345678')`;

// 1) First reading → usage 0, invoice = rent + flat fees only
const { invoiceId: inv1 } = await createReadingAndInvoice({
  dorm, room, period: "2026-06", waterCurrent: 100, electricCurrent: 500,
});
let inv = (await getInvoice(inv1, 1))!;
// rent 3000 + water 0 + electric 0 + service 10 + trash 20 + wifi 100
assert.equal(inv.total, 3130, `first invoice total ${inv.total}`);
assert.equal(deriveStatus(inv), "draft");

// 2) Next month → usage from delta: water 10*9=90, elec 50*4.75=237.5
const { invoiceId: inv2 } = await createReadingAndInvoice({
  dorm, room, period: "2026-07", waterCurrent: 110, electricCurrent: 550,
});
inv = (await getInvoice(inv2, 1))!;
assert.equal(inv.total, 3130 + 90 + 237.5, `second invoice total ${inv.total}`);
assert.equal(inv.tenant_name, "สมชาย", "tenant snapshot");

// 3) Meter going backwards without reset flag → rejected
await assert.rejects(
  createReadingAndInvoice({ dorm, room, period: "2026-08", waterCurrent: 50, electricCurrent: 550 })
);

// 4) Meter reset with manual usage override
const { invoiceId: inv3 } = await createReadingAndInvoice({
  dorm, room, period: "2026-08", waterCurrent: 5, electricCurrent: 560,
  meterReset: true, waterUsageOverride: 12, electricUsageOverride: 10,
});
inv = (await getInvoice(inv3, 1))!;
assert.equal(inv.total, 3130 + 12 * 9 + 10 * 4.75, `reset invoice total ${inv.total}`);

// 5) Issue + partial + full payment → derived statuses
await issueInvoice(inv2, dorm.due_in_days);
inv = (await getInvoice(inv2, 1))!;
assert.equal(inv.status, "issued");
assert.ok(inv.due_date, "due date set");
await s`INSERT INTO payments (invoice_id, amount, method) VALUES (${inv2}, 1000, 'cash')`;
assert.equal(deriveStatus((await getInvoice(inv2, 1))!), "partial");
await s`INSERT INTO payments (invoice_id, amount, method) VALUES (${inv2}, ${inv.total - 1000}, 'promptpay')`;
assert.equal(deriveStatus((await getInvoice(inv2, 1))!), "paid");

// 6) Void + reissue same period → reading upserted, revision-suffixed invoice_no
await voidInvoice(inv1);
const { invoiceId: inv4 } = await createReadingAndInvoice({
  dorm, room, period: "2026-06", waterCurrent: 105, electricCurrent: 500, // corrected reading upserts
});
inv = (await getInvoice(inv4, 1))!;
assert.ok(inv.invoice_no.endsWith("-R2"), `reissued no ${inv.invoice_no}`);
assert.equal(deriveStatus((await getInvoice(inv1, 1))!), "void");

// 7) Overdue derivation
const overdueId = (
  await s<{ id: number }[]>`
    INSERT INTO invoices (dorm_id, room_id, period, invoice_no, room_no, status, total, issue_date, due_date)
    VALUES (1, 1, '2026-05', 'INV-TEST-OVERDUE', '101', 'issued', 500, '2026-05-01', '2026-05-08')
    RETURNING id`
)[0].id;
assert.equal(deriveStatus((await getInvoice(overdueId, 1))!), "overdue");

console.log("✅ selfcheck passed: billing engine OK");
await s.end();
