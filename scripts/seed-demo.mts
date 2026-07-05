// Demo seed: owner demo@horprom.test / password12345, 3 rooms, tenants, invoices.
// Run: npm run seed
import bcrypt from "bcryptjs";
const { sql, ensureSchema } = await import("../lib/db");
const { createReadingAndInvoice, issueInvoice } = await import("../lib/billing");
const { normalizeRoomNo, currentPeriod } = await import("../lib/util");

const s = sql();
await ensureSchema();

if ((await s`SELECT 1 FROM owners WHERE email = 'demo@horprom.test'`).length) {
  console.log("already seeded");
  await s.end();
  process.exit(0);
}

const ownerId = (
  await s<{ id: number }[]>`
    INSERT INTO owners (email, password_hash, display_name)
    VALUES ('demo@horprom.test', ${bcrypt.hashSync("password12345", 10)}, 'คุณสมศรี') RETURNING id`
)[0].id;
const dormId = (
  await s<{ id: number }[]>`
    INSERT INTO dorms (owner_id, name, promptpay_id) VALUES (${ownerId}, 'หอพักสุขใจ', '0812345678') RETURNING id`
)[0].id;

const dorm = (await s`SELECT * FROM dorms WHERE id = ${dormId}`)[0] as never as Parameters<typeof createReadingAndInvoice>[0]["dorm"] & { due_in_days: number };

const roomsSpec = [
  { no: "101", rent: 3500, tenant: "สมชาย ใจดี", phone: "0899991111" },
  { no: "102", rent: 3500, tenant: "มะลิ งามวงศ์", phone: "0899992222" },
  { no: "201", rent: 4000, tenant: null, phone: null },
];

const period = currentPeriod();
const [y, m] = period.split("-").map(Number);
const prevPeriod = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;

for (const spec of roomsSpec) {
  const roomId = (
    await s<{ id: number }[]>`
      INSERT INTO rooms (dorm_id, room_no, room_no_norm, base_rent)
      VALUES (${dormId}, ${spec.no}, ${normalizeRoomNo(spec.no)}, ${spec.rent}) RETURNING id`
  )[0].id;
  if (!spec.tenant) continue;
  await s`
    INSERT INTO tenants (room_id, full_name, phone, moved_in_at)
    VALUES (${roomId}, ${spec.tenant}, ${spec.phone}, CURRENT_DATE - INTERVAL '6 months')`;

  const room = (await s`SELECT * FROM rooms WHERE id = ${roomId}`)[0] as never as Parameters<typeof createReadingAndInvoice>[0]["room"];
  // baseline last month (paid), real usage this month (outstanding)
  const base = await createReadingAndInvoice({ dorm, room, period: prevPeriod, waterCurrent: 120, electricCurrent: 800 });
  await issueInvoice(base.invoiceId, dorm.due_in_days);
  await s`
    INSERT INTO payments (invoice_id, amount, method, paid_at)
    VALUES (${base.invoiceId}, (SELECT total FROM invoices WHERE id = ${base.invoiceId}), 'promptpay', now() - INTERVAL '20 days')`;
  const cur = await createReadingAndInvoice({ dorm, room, period, waterCurrent: 128, electricCurrent: 890 });
  await issueInvoice(cur.invoiceId, dorm.due_in_days);
}

await s`
  INSERT INTO complaints (dorm_id, room_id, reporter_name, phone, topic, detail)
  VALUES (${dormId}, 1, 'สมชาย ใจดี', '0899991111', 'แอร์ไม่เย็น', 'แอร์ห้อง 101 มีแต่ลม ไม่มีความเย็น รบกวนช่างมาดูครับ')`;

console.log("seeded: demo@horprom.test / password12345");
await s.end();
