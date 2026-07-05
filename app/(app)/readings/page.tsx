import Link from "next/link";
import { sql } from "@/lib/db";
import { getDorm } from "@/app/actions";
import { currentPeriod, fmtPeriod } from "@/lib/util";
import { ReadingRow, type RoomReadingInfo } from "./reading-row";

export const dynamic = "force-dynamic";

export default async function ReadingsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const dorm = await getDorm();
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  const rooms = await sql()<(RoomReadingInfo & {
    reading_id: number | null;
    water_usage: number | null;
    electric_usage: number | null;
    invoice_id: number | null;
  })[]>`
    SELECT r.id, r.room_no,
      (SELECT full_name FROM tenants t WHERE t.room_id = r.id AND t.is_active = 1) AS tenant_name,
      (SELECT water_current FROM meter_readings m WHERE m.room_id = r.id AND m.period < ${period} ORDER BY m.period DESC LIMIT 1) AS prev_water,
      (SELECT electric_current FROM meter_readings m WHERE m.room_id = r.id AND m.period < ${period} ORDER BY m.period DESC LIMIT 1) AS prev_electric,
      (SELECT id FROM meter_readings m WHERE m.room_id = r.id AND m.period = ${period}) AS reading_id,
      (SELECT water_usage FROM meter_readings m WHERE m.room_id = r.id AND m.period = ${period}) AS water_usage,
      (SELECT electric_usage FROM meter_readings m WHERE m.room_id = r.id AND m.period = ${period}) AS electric_usage,
      (SELECT id FROM invoices i WHERE i.room_id = r.id AND i.period = ${period} AND i.status <> 'void' LIMIT 1) AS invoice_id
     FROM rooms r WHERE r.dorm_id = ${dorm.id} ORDER BY r.room_no_norm`;

  const done = rooms.filter((r) => r.invoice_id);
  const todo = rooms.filter((r) => !r.invoice_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">จดมิเตอร์ · {fmtPeriod(period)}</h1>
        <form className="flex items-center gap-2 text-sm">
          <input
            type="month"
            name="period"
            defaultValue={period}
            className="rounded-lg border border-sand px-2.5 py-1.5"
          />
          <button className="rounded-lg border border-sand bg-white px-3 py-1.5 hover:bg-cream-dark">เปลี่ยนเดือน</button>
        </form>
      </div>

      <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
        <h2 className="mb-2 font-semibold">รอจดมิเตอร์ ({todo.length} ห้อง)</h2>
        <p className="mb-3 text-xs text-stone-500">
          กรอกเลขมิเตอร์ปัจจุบัน ระบบจะคำนวณหน่วยที่ใช้และสร้างใบแจ้งหนี้ (ร่าง) ให้อัตโนมัติ
        </p>
        {todo.length === 0 ? (
          <p className="text-sm text-stone-500">จดครบทุกห้องแล้ว ✅</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {todo.map((r) => (
                <ReadingRow key={r.id} room={r} period={period} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {done.length > 0 && (
        <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <h2 className="mb-3 font-semibold">จดแล้วเดือนนี้ ({done.length} ห้อง)</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="pb-2">ห้อง</th>
                <th className="pb-2">น้ำ (หน่วย)</th>
                <th className="pb-2">ไฟ (หน่วย)</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {done.map((r) => (
                <tr key={r.id} className="border-t border-cream-dark">
                  <td className="py-2 font-medium">ห้อง {r.room_no}</td>
                  <td className="py-2">{r.water_usage}</td>
                  <td className="py-2">{r.electric_usage}</td>
                  <td className="py-2 text-right">
                    <Link href={`/invoices/${r.invoice_id}`} className="text-marigold-700 hover:underline">
                      ดูใบแจ้งหนี้ →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
