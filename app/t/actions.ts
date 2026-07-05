"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { verifyPayload, normalizeRoomNo } from "@/lib/util";

// Tenant-facing, no login: trust boundary is the signed token, so re-verify here.
export async function submitComplaintAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const payload = verifyPayload(token);
  if (!payload?.startsWith("complaint|")) redirect("/t/complaint?error=1");
  const dormId = Number(payload!.split("|")[1]);

  const name = String(form.get("reporter_name") ?? "").trim();
  const topic = String(form.get("topic") ?? "").trim();
  const detail = String(form.get("detail") ?? "").trim();
  const roomNo = String(form.get("room_no") ?? "").trim();
  if (!name || !topic || !detail) redirect(`/t/complaint?token=${encodeURIComponent(token)}&error=1`);

  const room = roomNo
    ? (
        await sql()<{ id: number }[]>`
          SELECT id FROM rooms WHERE dorm_id = ${dormId} AND room_no_norm = ${normalizeRoomNo(roomNo)}`
      )[0]
    : undefined;

  await sql()`
    INSERT INTO complaints (dorm_id, room_id, reporter_name, phone, topic, detail)
    VALUES (${dormId}, ${room?.id ?? null}, ${name}, ${String(form.get("phone") ?? "") || null}, ${topic}, ${detail.slice(0, 2000)})`;

  // Admin heads-up via LINE — carried from GAS ADMIN_LINE_USER_ID.
  const admin = process.env.LINE_ADMIN_USER_ID;
  if (admin) {
    const { pushMessages } = await import("@/lib/line");
    await pushMessages(admin, [
      {
        type: "text",
        text: `📣 เรื่องแจ้งซ่อมใหม่\nห้อง: ${roomNo || "-"}\nเรื่อง: ${topic}\nโดย: ${name}\n\n${detail.slice(0, 300)}`,
      },
    ]).catch((e) => console.error("LINE admin notify failed:", e));
  }

  redirect(`/t/complaint?token=${encodeURIComponent(token)}&ok=1`);
}
