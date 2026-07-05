import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";

const NAV = [
  { href: "/dashboard", label: "ภาพรวม", icon: "📊" },
  { href: "/rooms", label: "ห้องพัก / ผู้เช่า", icon: "🚪" },
  { href: "/readings", label: "จดมิเตอร์", icon: "⚡" },
  { href: "/invoices", label: "ใบแจ้งหนี้", icon: "🧾" },
  { href: "/complaints", label: "แจ้งซ่อม", icon: "🔧" },
  { href: "/settings", label: "ตั้งค่า", icon: "⚙️" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col bg-teak-900 text-orange-50">
        <div className="border-b border-teak-800 px-5 py-5">
          <div className="font-display text-2xl font-bold text-marigold-400">หอพร้อม</div>
          <div className="mt-0.5 text-xs text-orange-50/50">ระบบจัดการหอพัก</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-orange-50/80 transition-colors hover:bg-teak-800 hover:text-marigold-400"
            >
              <span>{n.icon}</span> {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-teak-800 p-3 text-sm">
          <div className="mb-2 truncate px-2 text-orange-50/60">{owner.display_name}</div>
          <form action={logoutAction}>
            <button className="w-full rounded-lg px-3 py-1.5 text-left text-orange-50/50 hover:bg-teak-800 hover:text-orange-50">
              ออกจากระบบ
            </button>
          </form>
        </div>
      </aside>
      <main className="max-w-6xl flex-1 p-6 lg:p-8">
        <AutoRefresh seconds={10} />
        {children}
      </main>
    </div>
  );
}
