import { sql, Tx } from "./db";

export type DerivedStatus = "draft" | "void" | "paid" | "partial" | "overdue" | "unpaid";

export type InvoiceRow = {
  id: number;
  dorm_id: number;
  room_id: number;
  tenant_id: number | null;
  period: string;
  invoice_no: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  room_no: string;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  status: "draft" | "issued" | "void";
  supersedes_id: number | null;
  note: string | null;
  paid: number; // SUM(payments)
};

export const STATUS_TH: Record<DerivedStatus, string> = {
  draft: "ร่าง",
  void: "ยกเลิก",
  paid: "ชำระแล้ว",
  partial: "ชำระบางส่วน",
  overdue: "เกินกำหนด",
  unpaid: "รอชำระ",
};

// Stored states are only draft|issued|void; paid/partial/overdue derived from payments sum.
export function deriveStatus(inv: InvoiceRow): DerivedStatus {
  if (inv.status === "draft" || inv.status === "void") return inv.status;
  const balance = inv.total - inv.paid;
  if (balance <= 0) return "paid";
  if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) return "overdue";
  if (inv.paid > 0) return "partial";
  return "unpaid";
}

export async function getInvoice(id: number, dormId: number): Promise<InvoiceRow | undefined> {
  const rows = await sql()<InvoiceRow[]>`
    SELECT i.*, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)::numeric(12,2) AS paid
    FROM invoices i WHERE i.id = ${id} AND i.dorm_id = ${dormId}`;
  return rows[0];
}

export async function listInvoices(dormId: number, period?: string): Promise<InvoiceRow[]> {
  return sql()<InvoiceRow[]>`
    SELECT i.*, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)::numeric(12,2) AS paid
    FROM invoices i
    WHERE i.dorm_id = ${dormId} ${period ? sql()`AND i.period = ${period}` : sql()``}
    ORDER BY i.room_no, i.created_at DESC`;
}

type Dorm = {
  id: number;
  water_rate: number;
  electric_rate: number;
  service_fee: number;
  trash_fee: number;
  wifi_fee: number;
  due_in_days: number;
};
type Room = { id: number; dorm_id: number; room_no: string; base_rent: number; wifi_fee: number | null };

// Record a meter reading + generate a draft invoice, one transaction.
// Previous readings are snapshotted into the row — never re-looked-up at invoice time.
export async function createReadingAndInvoice(args: {
  dorm: Dorm;
  room: Room;
  period: string;
  waterCurrent: number;
  electricCurrent: number;
  meterReset?: boolean;
  waterUsageOverride?: number; // required when meterReset
  electricUsageOverride?: number;
  note?: string;
}): Promise<{ invoiceId: number }> {
  return sql().begin(async (tx) => {
    const prev = (
      await tx<{ water_current: number; electric_current: number }[]>`
        SELECT water_current, electric_current FROM meter_readings
        WHERE room_id = ${args.room.id} AND period < ${args.period}
        ORDER BY period DESC LIMIT 1`
    )[0];

    // First reading with no baseline: previous = current → usage 0, never negative.
    const waterPrev = prev?.water_current ?? args.waterCurrent;
    const elecPrev = prev?.electric_current ?? args.electricCurrent;

    let waterUsage = args.waterCurrent - waterPrev;
    let elecUsage = args.electricCurrent - elecPrev;
    if (args.meterReset) {
      waterUsage = args.waterUsageOverride ?? 0;
      elecUsage = args.electricUsageOverride ?? 0;
    } else if (waterUsage < 0 || elecUsage < 0) {
      throw new Error(
        "เลขมิเตอร์น้อยกว่าครั้งก่อน — ถ้าเปลี่ยนมิเตอร์ให้ติ๊ก 'มิเตอร์ใหม่' แล้วกรอกหน่วยที่ใช้เอง"
      );
    }

    // Upsert: after void+reissue the owner re-enters this period's reading —
    // replace the old row so FK links from the voided invoice stay intact.
    const reading = (
      await tx<{ id: number }[]>`
        INSERT INTO meter_readings (room_id, period, water_previous, water_current, water_usage,
          electric_previous, electric_current, electric_usage, meter_reset, note)
        VALUES (${args.room.id}, ${args.period}, ${waterPrev}, ${args.waterCurrent}, ${waterUsage},
          ${elecPrev}, ${args.electricCurrent}, ${elecUsage}, ${args.meterReset ? 1 : 0}, ${args.note ?? null})
        ON CONFLICT (room_id, period) DO UPDATE SET
          water_previous = excluded.water_previous, water_current = excluded.water_current,
          water_usage = excluded.water_usage, electric_previous = excluded.electric_previous,
          electric_current = excluded.electric_current, electric_usage = excluded.electric_usage,
          meter_reset = excluded.meter_reset, note = excluded.note
        RETURNING id`
    )[0];

    return { invoiceId: await generateInvoice(tx, args.dorm, args.room, args.period, reading.id, waterUsage, elecUsage) };
  });
}

async function generateInvoice(
  tx: Tx,
  dorm: Dorm,
  room: Room,
  period: string,
  readingId: number,
  waterUsage: number,
  elecUsage: number
): Promise<number> {
  const tenant = (
    await tx<{ id: number; full_name: string; phone: string | null }[]>`
      SELECT id, full_name, phone FROM tenants WHERE room_id = ${room.id} AND is_active = 1`
  )[0];

  // Revision-suffixed invoice number survives void+reissue (GAS row-number scheme didn't).
  const roomKey = room.room_no.replace(/\s+/g, "");
  const base = `INV-${period.replace("-", "")}-${roomKey}`;
  const count = (
    await tx<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM invoices WHERE invoice_no LIKE ${base + "%"}`
  )[0].c;
  const invoiceNo = count === 0 ? base : `${base}-R${count + 1}`;

  const invoiceId = (
    await tx<{ id: number }[]>`
      INSERT INTO invoices (dorm_id, room_id, tenant_id, period, invoice_no, tenant_name, tenant_phone, room_no, status)
      VALUES (${dorm.id}, ${room.id}, ${tenant?.id ?? null}, ${period}, ${invoiceNo},
        ${tenant?.full_name ?? null}, ${tenant?.phone ?? null}, ${room.room_no}, 'draft')
      RETURNING id`
  )[0].id;

  type Item = [kind: string, desc: string, qty: number | null, price: number | null, amount: number, readingId: number | null];
  const items: Item[] = [
    ["rent", "ค่าเช่าห้อง", null, null, room.base_rent, null],
    ["water", "ค่าน้ำ", waterUsage, dorm.water_rate, round2(waterUsage * dorm.water_rate), readingId],
    ["electric", "ค่าไฟ", elecUsage, dorm.electric_rate, round2(elecUsage * dorm.electric_rate), readingId],
  ];
  if (dorm.service_fee > 0) items.push(["service", "ค่าส่วนกลาง", null, null, dorm.service_fee, null]);
  if (dorm.trash_fee > 0) items.push(["trash", "ค่าขยะ", null, null, dorm.trash_fee, null]);
  const wifi = room.wifi_fee ?? dorm.wifi_fee;
  if (wifi > 0) items.push(["wifi", "ค่าอินเทอร์เน็ต", null, null, wifi, null]);

  for (const [kind, description, quantity, unit_price, amount, mrId] of items) {
    await tx`
      INSERT INTO invoice_items (invoice_id, kind, description, quantity, unit_price, amount, meter_reading_id)
      VALUES (${invoiceId}, ${kind}, ${description}, ${quantity}, ${unit_price}, ${amount}, ${mrId})`;
  }

  await recomputeTotal(invoiceId, tx);
  return invoiceId;
}

export async function recomputeTotal(invoiceId: number, tx: Tx = sql()) {
  await tx`
    UPDATE invoices SET total = COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = ${invoiceId}), 0)
    WHERE id = ${invoiceId}`;
}

export async function issueInvoice(invoiceId: number, dueInDays: number) {
  const today = new Date();
  const due = new Date(today.getTime() + dueInDays * 86400_000);
  await sql()`
    UPDATE invoices SET status = 'issued',
      issue_date = ${today.toISOString().slice(0, 10)}, due_date = ${due.toISOString().slice(0, 10)}
    WHERE id = ${invoiceId} AND status = 'draft'`;
}

export async function voidInvoice(invoiceId: number) {
  await sql()`UPDATE invoices SET status = 'void' WHERE id = ${invoiceId} AND status <> 'void'`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
