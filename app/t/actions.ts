"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { verifyPayload, normalizeRoomNo } from "@/lib/util";

// Self-service LINE registration from the signed page the bot links to.
// Token carries the LINE userId, so binding needs no manual owner step.
export async function registerLineFromPageAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const payload = verifyPayload(token);
  if (!payload?.startsWith("register|")) redirect("/t/register?error=1");
  const lineUserId = payload!.split("|")[1];
  const back = (q: string) => redirect(`/t/register?token=${encodeURIComponent(token)}&${q}`);

  const roomId = Number(form.get("room_id"));
  const name = String(form.get("full_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").replace(/\D/g, "");
  if (!roomId || !name || phone.length < 9) back("error=1");

  const room = (
    await sql()<{ id: number; room_no: string; tenant_id: number | null; tenant_phone: string | null }[]>`
      SELECT r.id, r.room_no, t.id AS tenant_id, t.phone AS tenant_phone
      FROM rooms r LEFT JOIN tenants t ON t.room_id = r.id AND t.is_active = 1
      WHERE r.id = ${roomId}`
  )[0];
  if (!room) back("error=1");

  if (room.tenant_id) {
    // Room already has a tenant on file — phone last-4 must match (carried from GAS).
    const onFile = (room.tenant_phone ?? "").replace(/\D/g, "");
    if (onFile && onFile.slice(-4) !== phone.slice(-4)) back("error=phone");
    await sql().begin((tx) => [
      tx`UPDATE tenants SET line_user_id = NULL WHERE line_user_id = ${lineUserId}`,
      tx`UPDATE tenants SET line_user_id = ${lineUserId}, phone = COALESCE(phone, ${phone})
         WHERE id = ${room.tenant_id}`,
    ]);
  } else {
    // Empty room — tenant self-registers; the owner sees it on /rooms and can move them out if wrong.
    await sql().begin((tx) => [
      tx`UPDATE tenants SET line_user_id = NULL WHERE line_user_id = ${lineUserId}`,
      tx`INSERT INTO tenants (room_id, full_name, phone, moved_in_at, line_user_id)
         VALUES (${roomId}, ${name}, ${phone}, CURRENT_DATE, ${lineUserId})`,
    ]);
  }

  const { pushMessages } = await import("@/lib/line");
  await pushMessages(lineUserId, [
    {
      type: "text",
      text:
        `ลงทะเบียนสำเร็จค่ะ 🎉\n\nห้อง: ${room.room_no}\nชื่อ: ${name}\n\n` +
        "หลังจากนี้ระบบจะส่งใบแจ้งหนี้มาที่ LINE นี้ค่ะ\nพิมพ์ \"บิล\" เพื่อดูใบแจ้งหนี้ล่าสุด",
    },
  ]).catch((e) => console.error("[line] register confirm push:", e));
  const admin = process.env.LINE_ADMIN_USER_ID;
  if (admin) {
    await pushMessages(admin, [
      { type: "text", text: `✅ ผู้เช่าลงทะเบียน LINE\nห้อง: ${room.room_no}\nชื่อ: ${name}\nโทร: ${phone}` },
    ]).catch((e) => console.error("[line] register admin push:", e));
  }
  back("ok=1");
}

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
