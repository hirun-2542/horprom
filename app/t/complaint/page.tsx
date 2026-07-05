import { verifyPayload } from "@/lib/util";
import { submitComplaintAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function TenantComplaintPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const payload = verifyPayload(token);
  const valid = payload?.startsWith("complaint|") ?? false;

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="font-display text-2xl font-bold text-marigold-700">หอพร้อม</h1>
      <h2 className="mb-4 text-lg font-semibold">แจ้งปัญหา / แจ้งซ่อม</h2>

      {!valid ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่จากเจ้าของหอพัก
        </p>
      ) : sp.ok ? (
        <div className="rounded-xl border border-lime-200 bg-lime-50 p-4 text-lime-800">
          ✅ รับเรื่องเรียบร้อยแล้ว เจ้าของหอพักจะติดต่อกลับโดยเร็ว
        </div>
      ) : (
        <form action={submitComplaintAction} className="space-y-3 rounded-2xl border border-sand bg-white shadow-sm p-5">
          <input type="hidden" name="token" value={token} />
          {sp.error && <p className="text-sm text-red-600">กรอกข้อมูลให้ครบถ้วน</p>}
          <Field label="ชื่อผู้แจ้ง *" name="reporter_name" required />
          <Field label="เลขห้อง" name="room_no" />
          <Field label="เบอร์โทร" name="phone" />
          <Field label="เรื่องที่แจ้ง *" name="topic" required placeholder="เช่น แอร์ไม่เย็น, น้ำรั่ว" />
          <label className="block text-sm text-stone-600">
            รายละเอียด *
            <textarea name="detail" required rows={4} className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm" />
          </label>
          <button className="w-full rounded-lg bg-marigold-700 px-4 py-2.5 font-medium text-white hover:bg-teak-800">
            ส่งเรื่อง
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, name, required, placeholder }: { label: string; name: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block text-sm text-stone-600">
      {label}
      <input name={name} required={required} placeholder={placeholder} className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm" />
    </label>
  );
}
