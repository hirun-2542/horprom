import Link from "next/link";
import { sql } from "@/lib/db";
import { getDorm } from "@/app/actions";
import { listInvoices, deriveStatus } from "@/lib/billing";
import { fmtMoney, fmtPeriod, currentPeriod, THAI_MONTHS } from "@/lib/util";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const dorm = await getDorm();
  const period = currentPeriod();

  // Independent queries fired in parallel — the DB is remote, sequential awaits stack RTTs.
  const [roomsRows, invoices, collectedRows, unpaid, history, complaintsRows] = await Promise.all([
    sql()<{ total: number; occupied: number }[]>`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.room_id = rooms.id AND t.is_active = 1))::int AS occupied
       FROM rooms WHERE dorm_id = ${dorm.id}`,
    listInvoices(dorm.id, period),
    sql()<{ s: number }[]>`
      SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2) AS s FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       WHERE i.dorm_id = ${dorm.id} AND to_char(p.paid_at, 'YYYY-MM') = ${period}`,
    sql()<(Parameters<typeof deriveStatus>[0] & { paid: number })[]>`
      SELECT i.id, i.room_no, i.period, i.total, i.due_date, i.status, i.tenant_name,
        COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0)::numeric(12,2) AS paid
       FROM invoices i
       WHERE i.dorm_id = ${dorm.id} AND i.status = 'issued'
         AND i.total > COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0)
       ORDER BY i.due_date`,
    sql()<{ m: string; s: number }[]>`
      SELECT to_char(p.paid_at, 'YYYY-MM') AS m, SUM(p.amount)::numeric(12,2) AS s FROM payments p
       JOIN invoices i ON p.invoice_id = i.id WHERE i.dorm_id = ${dorm.id}
       GROUP BY m ORDER BY m DESC LIMIT 6`,
    sql()<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM complaints WHERE dorm_id = ${dorm.id} AND status = 'new'`,
  ]);
  const rooms = roomsRows[0];
  const issued = invoices.filter((i) => i.status === "issued");
  const billed = issued.reduce((s, i) => s + i.total, 0);
  const collected = collectedRows[0].s;
  const newComplaints = complaintsRows[0].c;

  const maxHistory = Math.max(...history.map((h) => h.s), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">{dorm.name}</h1>
        <span className="text-sm text-stone-500">ประจำเดือน {fmtPeriod(period)} · อัปเดตอัตโนมัติ</span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="ห้องมีผู้เช่า" value={`${rooms.occupied ?? 0}/${rooms.total}`} sub="ห้อง" />
        <Stat label="ยอดเรียกเก็บเดือนนี้" value={fmtMoney(billed)} sub="บาท" />
        <Stat label="เก็บได้แล้วเดือนนี้" value={fmtMoney(collected)} sub="บาท" accent="text-lime-700" />
        <Stat label="ค้างชำระทั้งหมด" value={fmtMoney(unpaid.reduce((s, i) => s + i.total - i.paid, 0))} sub="บาท" accent={unpaid.length ? "text-red-600" : undefined} />
      </div>

      {newComplaints > 0 && (
        <Link href="/complaints" className="block rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          🔧 มีเรื่องแจ้งซ่อมใหม่ {newComplaints} รายการ — กดเพื่อดู
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <h2 className="mb-3 font-semibold">ห้องค้างชำระ ({unpaid.length})</h2>
          {unpaid.length === 0 ? (
            <p className="text-sm text-stone-500">ไม่มีบิลค้างชำระ 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {unpaid.map((i) => (
                  <tr key={i.id} className="border-t border-cream-dark">
                    <td className="py-2 font-medium">
                      <Link href={`/invoices/${i.id}`} className="text-marigold-700 hover:underline">
                        ห้อง {i.room_no}
                      </Link>
                      <span className="ml-2 text-xs text-stone-400">{fmtPeriod(i.period)}</span>
                    </td>
                    <td className="py-2 text-right">{fmtMoney(i.total - i.paid)} ฿</td>
                    <td className="py-2 pl-3 text-right">
                      <StatusBadge status={deriveStatus(i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <h2 className="mb-3 font-semibold">ยอดรับชำระย้อนหลัง</h2>
          {history.length === 0 ? (
            <p className="text-sm text-stone-500">ยังไม่มีข้อมูลการรับชำระ</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => {
                const [y, m] = h.m.split("-").map(Number);
                return (
                  <div key={h.m} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 text-stone-500">{THAI_MONTHS[m - 1].slice(0, 4)} {String(y + 543).slice(2)}</span>
                    <div className="h-5 flex-1 rounded bg-cream-dark">
                      <div className="h-5 rounded bg-marigold-400" style={{ width: `${(h.s / maxHistory) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium">{fmtMoney(h.s)} ฿</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-sand bg-white shadow-sm p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ?? ""}`}>
        {value} <span className="text-sm font-normal text-stone-400">{sub}</span>
      </div>
    </div>
  );
}
