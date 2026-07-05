import { sql } from "@/lib/db";
import { verifyPayload } from "@/lib/util";
import { registerLineFromPageAction } from "../actions";

export const dynamic = "force-dynamic";

// ponytail: single-OA install — rooms come from the (only) dorm, same as the complaint flow.
export default async function TenantRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const payload = verifyPayload(token);
  const valid = payload?.startsWith("register|") ?? false;

  const rooms = valid
    ? await sql()<{ id: number; room_no: string; occupied: boolean }[]>`
        SELECT r.id, r.room_no,
          EXISTS (SELECT 1 FROM tenants t WHERE t.room_id = r.id AND t.is_active = 1) AS occupied
        FROM rooms r
        WHERE r.dorm_id = (SELECT id FROM dorms ORDER BY id LIMIT 1)
        ORDER BY r.room_no_norm`
    : [];

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="font-display text-2xl font-bold text-marigold-700">หอพร้อม</h1>
      <h2 className="mb-4 text-lg font-semibold">ลงทะเบียนรับใบแจ้งหนี้ทาง LINE</h2>

      {!valid ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณากดปุ่ม &quot;ลงทะเบียน&quot; ในแชท LINE อีกครั้ง
        </p>
      ) : sp.ok ? (
        <div className="rounded-xl border border-lime-200 bg-lime-50 p-4 text-lime-800">
          ✅ ลงทะเบียนเรียบร้อยแล้ว — ระบบจะส่งใบแจ้งหนี้มาที่ LINE ของคุณ ปิดหน้านี้ได้เลยค่ะ
        </div>
      ) : (
        <form action={registerLineFromPageAction} className="space-y-3 rounded-2xl border border-sand bg-white shadow-sm p-5">
          <input type="hidden" name="token" value={token} />
          {sp.error === "phone" && (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">
              เบอร์โทรไม่ตรงกับข้อมูลผู้เช่าของห้องนี้ กรุณาติดต่อเจ้าของหอ
            </p>
          )}
          {sp.error === "1" && <p className="text-sm text-red-600">กรอกข้อมูลให้ครบถ้วน</p>}
          <label className="block text-sm text-stone-600">
            เลขห้อง *
            <select name="room_id" required defaultValue="" className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm">
              <option value="" disabled>— เลือกห้อง —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.room_no}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-stone-600">
            ชื่อ-นามสกุล *
            <input name="full_name" required className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm text-stone-600">
            เบอร์โทรศัพท์ *
            <input name="phone" type="tel" required minLength={9} placeholder="08xxxxxxxx" className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm" />
          </label>
          <button className="w-full rounded-lg bg-marigold-700 px-4 py-2.5 font-medium text-white hover:bg-teak-800">
            ลงทะเบียน
          </button>
          <p className="text-xs text-stone-400">
            ถ้าห้องของคุณมีข้อมูลผู้เช่าอยู่แล้ว เบอร์โทรต้องตรงกับที่แจ้งเจ้าของหอไว้
          </p>
        </form>
      )}
    </div>
  );
}
