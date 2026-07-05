import { requireOwner } from "@/lib/auth";
import { getDorm, moveOutTenantAction, linkTenantLineAction } from "@/app/actions";
import { sql } from "@/lib/db";
import { fmtMoney } from "@/lib/util";
import AddRoomForm from "./AddRoomForm";
import AddTenantForm from "./AddTenantForm";

type RoomRow = {
  id: number;
  room_no: string;
  base_rent: number;
  wifi_fee: number | null;
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_line_user_id: string | null;
};

export default async function RoomsPage() {
  await requireOwner();
  const dorm = await getDorm();

  // LINE accounts that messaged the OA but aren't bound to any tenant yet.
  const [rooms, contacts] = await Promise.all([
    sql()<RoomRow[]>`
      SELECT r.id, r.room_no, r.base_rent, r.wifi_fee,
              t.id AS tenant_id, t.full_name AS tenant_name, t.phone AS tenant_phone, t.line_user_id AS tenant_line_user_id
       FROM rooms r
       LEFT JOIN tenants t ON t.room_id = r.id AND t.is_active = 1
       WHERE r.dorm_id = ${dorm.id}
       ORDER BY r.room_no_norm`,
    sql()<{ line_user_id: string; display_name: string | null }[]>`
      SELECT c.line_user_id, c.display_name FROM line_contacts c
       WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.line_user_id = c.line_user_id)
       ORDER BY c.last_seen DESC LIMIT 30`,
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-teak-950">ห้องพัก / ผู้เช่า</h1>

      <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
        <AddRoomForm />
      </div>

      <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
        {rooms.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">ยังไม่มีห้องพัก — เพิ่มห้องแรกด้านบน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-sand text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3 font-medium">เลขห้อง</th>
                  <th className="py-2 pr-3 font-medium">ค่าเช่า</th>
                  <th className="py-2 pr-3 font-medium">ผู้เช่า</th>
                  <th className="py-2 pr-3 font-medium">เบอร์โทร</th>
                  <th className="py-2 pr-3 font-medium">LINE</th>
                  <th className="py-2 pr-3 font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-b border-cream-dark last:border-0">
                    <td className="py-3 pr-3 font-medium text-teak-950">{r.room_no}</td>
                    <td className="py-3 pr-3 text-teak-800">{fmtMoney(r.base_rent)}</td>
                    <td className="py-3 pr-3 text-teak-800">{r.tenant_name ?? "—"}</td>
                    <td className="py-3 pr-3 text-teak-800">{r.tenant_phone ?? "—"}</td>
                    <td className="py-3 pr-3 text-teak-800">
                      {r.tenant_line_user_id ? (
                        <span title={r.tenant_line_user_id}>✅</span>
                      ) : r.tenant_id ? (
                        contacts.length > 0 ? (
                          <form action={linkTenantLineAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="tenant_id" value={r.tenant_id} />
                            <select
                              name="line_user_id"
                              required
                              defaultValue=""
                              className="max-w-40 rounded-lg border border-sand px-2 py-1 text-sm"
                            >
                              <option value="" disabled>— เลือกบัญชี —</option>
                              {contacts.map((c) => (
                                <option key={c.line_user_id} value={c.line_user_id}>
                                  {c.display_name ?? `${c.line_user_id.slice(0, 8)}…`}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="rounded-lg bg-marigold-700 px-2.5 py-1 text-sm text-white hover:bg-teak-800">
                              ผูก
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-stone-400" title="เมื่อผู้เช่าทัก LINE OA ระบบจะจำบัญชีมาให้เลือกที่นี่">
                            รอผู้เช่าทัก OA
                          </span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {r.tenant_id ? (
                        <form action={moveOutTenantAction}>
                          <input type="hidden" name="tenant_id" value={r.tenant_id} />
                          <button type="submit" className="text-sm text-red-600 hover:underline">
                            ย้ายออก
                          </button>
                        </form>
                      ) : (
                        <AddTenantForm roomId={r.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
