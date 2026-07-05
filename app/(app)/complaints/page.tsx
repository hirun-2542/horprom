import { getDorm, updateComplaintStatusAction } from "@/app/actions";
import { sql } from "@/lib/db";
import { signPayload } from "@/lib/util";

type ComplaintRow = {
  id: number;
  room_id: number | null;
  reporter_name: string;
  phone: string | null;
  topic: string;
  detail: string;
  status: "new" | "in_progress" | "resolved";
  created_at: string;
  room_no: string | null;
};

const STATUS_LABEL: Record<ComplaintRow["status"], string> = {
  new: "รอรับเรื่อง",
  in_progress: "กำลังดำเนินการ",
  resolved: "เสร็จสิ้น",
};

const STATUS_BADGE: Record<ComplaintRow["status"], string> = {
  new: "bg-marigold-100 text-marigold-700",
  in_progress: "bg-sky-100 text-sky-800",
  resolved: "bg-lime-100 text-lime-800",
};

const STATUS_OPTIONS: ComplaintRow["status"][] = ["new", "in_progress", "resolved"];

export default async function ComplaintsPage() {
  const dorm = await getDorm();

  const complaints = await sql()<ComplaintRow[]>`
    SELECT c.id, c.room_id, c.reporter_name, c.phone, c.topic, c.detail, c.status, c.created_at,
            r.room_no AS room_no
     FROM complaints c
     LEFT JOIN rooms r ON r.id = c.room_id
     WHERE c.dorm_id = ${dorm.id}
     ORDER BY c.created_at DESC`;

  const complaintLink = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/t/complaint?token=${signPayload(
    "complaint|" + dorm.id,
    365
  )}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-teak-950">แจ้งซ่อม</h1>

      <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
        <h2 className="mb-2 text-base font-semibold text-teak-950">ลิงก์แจ้งซ่อมสำหรับผู้เช่า</h2>
        <input
          type="text"
          readOnly
          defaultValue={complaintLink}
          className="w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-teak-800"
        />
        <p className="mt-1 text-xs text-stone-400">ส่งลิงก์นี้ให้ผู้เช่า ใช้แจ้งปัญหาได้โดยไม่ต้องล็อกอิน</p>
      </div>

      {complaints.length === 0 ? (
        <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <p className="py-8 text-center text-sm text-stone-400">ยังไม่มีรายการแจ้งซ่อม</p>
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <div key={c.id} className="rounded-2xl border border-sand bg-white shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-teak-950">{c.topic}</div>
                  <p className="mt-1 text-sm text-teak-800">{c.detail}</p>
                  <p className="mt-2 text-xs text-stone-500">
                    {c.reporter_name}
                    {c.phone ? ` · ${c.phone}` : ""}
                    {c.room_no ? ` · ห้อง ${c.room_no}` : ""} · {c.created_at}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[c.status]}`}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <form key={s} action={updateComplaintStatusAction}>
                    <input type="hidden" name="complaint_id" value={c.id} />
                    <input type="hidden" name="status" value={s} />
                    <button
                      type="submit"
                      disabled={c.status === s}
                      className="rounded-lg border border-sand px-3 py-1.5 text-xs font-medium text-teak-800 hover:bg-cream-dark disabled:cursor-default disabled:border-marigold-400 disabled:bg-marigold-100 disabled:text-marigold-700"
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
