import Link from "next/link";
import { getDorm, issueAllDraftsAction } from "@/app/actions";
import { listInvoices, deriveStatus } from "@/lib/billing";
import { fmtMoney, fmtPeriod, currentPeriod } from "@/lib/util";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; all?: string }>;
}) {
  const dorm = await getDorm();
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();
  const invoices = await listInvoices(dorm.id, showAll ? undefined : period);
  const draftCount = showAll ? 0 : invoices.filter((i) => i.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          ใบแจ้งหนี้ {showAll ? "· ทั้งหมด" : `· ${fmtPeriod(period)}`}
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <form className="flex items-center gap-2">
            <input type="month" name="period" defaultValue={period} className="rounded-lg border border-sand px-2.5 py-1.5" />
            <button className="rounded-lg border border-sand bg-white px-3 py-1.5 hover:bg-cream-dark">ดูเดือนนี้</button>
          </form>
          <Link
            href={showAll ? "/invoices" : "/invoices?all=1"}
            className="rounded-lg border border-sand bg-white px-3 py-1.5 hover:bg-cream-dark"
          >
            {showAll ? "ดูรายเดือน" : "ดูทั้งหมด"}
          </Link>
        </div>
      </div>

      {draftCount > 0 && (
        <form action={issueAllDraftsAction} className="flex items-center justify-between rounded-xl border border-marigold-400 bg-marigold-100 p-4">
          <span className="text-sm text-teak-800">มีบิลร่าง {draftCount} ใบของเดือนนี้ — ออกบิลทั้งหมดและส่งแจ้งเตือน LINE ให้ผู้เช่าที่ผูกบัญชีไว้</span>
          <input type="hidden" name="period" value={period} />
          <button className="shrink-0 rounded-lg bg-marigold-700 px-4 py-2 text-sm font-medium text-white hover:bg-teak-800">
            ออกบิล + ส่ง LINE ({draftCount})
          </button>
        </form>
      )}

      <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
        {invoices.length === 0 ? (
          <p className="text-sm text-stone-500">
            ยังไม่มีใบแจ้งหนี้ — ไปที่ <Link href="/readings" className="text-marigold-700 hover:underline">จดมิเตอร์</Link> เพื่อสร้างบิล
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="pb-2">เลขที่</th>
                <th className="pb-2">ห้อง</th>
                <th className="pb-2">ผู้เช่า</th>
                <th className="pb-2">เดือน</th>
                <th className="pb-2 text-right">ยอดรวม</th>
                <th className="pb-2 text-right">ค้าง</th>
                <th className="pb-2 text-right">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-t border-cream-dark hover:bg-cream-dark">
                  <td className="py-2">
                    <Link href={`/invoices/${i.id}`} className="font-medium text-marigold-700 hover:underline">
                      {i.invoice_no}
                    </Link>
                  </td>
                  <td className="py-2">{i.room_no}</td>
                  <td className="py-2 text-stone-600">{i.tenant_name ?? "—"}</td>
                  <td className="py-2 text-stone-600">{fmtPeriod(i.period)}</td>
                  <td className="py-2 text-right">{fmtMoney(i.total)}</td>
                  <td className="py-2 text-right">{i.status === "issued" ? fmtMoney(Math.max(i.total - i.paid, 0)) : "—"}</td>
                  <td className="py-2 pl-3 text-right"><StatusBadge status={deriveStatus(i)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
