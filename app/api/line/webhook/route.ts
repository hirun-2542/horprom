import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { sql } from "@/lib/db";
import { normalizeRoomNo, signPayload, fmtPeriod } from "@/lib/util";
import { replyText, replyMessages, invoiceFlexMessage, openPageFlexMessage, getProfile } from "@/lib/line";

// LINE webhook — flows ported from Version Excel (LineWebhook.gs).
// Always returns 200 (LINE requirement), even on verify failure or handler error.
const ok = () => NextResponse.json({ ok: true });

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
  postback?: { data?: string };
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verified(req, body)) {
    console.log("[line] webhook denied (bad signature/token)");
    return ok();
  }
  try {
    const events: LineEvent[] = JSON.parse(body).events ?? [];
    for (const ev of events) {
      await handleEvent(ev).catch((e) => console.error("[line] webhook handler:", e));
    }
  } catch {
    // Bad payload — still 200.
  }
  return ok();
}

function verified(req: NextRequest, body: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (secret) {
    const sig = createHmac("sha256", secret).update(body).digest("base64");
    return sig === req.headers.get("x-line-signature");
  }
  // GAS-style fallback: shared secret in the webhook URL (?token=...)
  const expect = process.env.LINE_WEBHOOK_VERIFY_TOKEN;
  if (expect) return req.nextUrl.searchParams.get("token") === expect;
  return true; // nothing configured — dev mode
}

const MENU_TEXT =
  "เมนูที่ใช้งานได้ค่ะ\n\n" +
  "1) ลงทะเบียนห้อง\nพิมพ์: ลงทะเบียน\n(ระบบจะส่งปุ่มเปิดฟอร์มให้)\n\n" +
  "2) ขอใบแจ้งหนี้ล่าสุด\nพิมพ์: บิล\n\n" +
  "3) ดู LINE User ID\nพิมพ์: id";

// Signed registration form link — the page knows the LINE userId from the token,
// so submitting the form binds/creates the tenant with no owner action needed.
const registerFlex = (userId: string) =>
  openPageFlexMessage({
    title: "ลงทะเบียนรับบิลทาง LINE",
    detail: "เลือกห้อง กรอกชื่อและเบอร์โทร ระบบจะส่งใบแจ้งหนี้มาที่ LINE นี้",
    buttonLabel: "เปิดฟอร์มลงทะเบียน",
    url: `${baseUrl()}/t/register?token=${encodeURIComponent(signPayload(`register|${userId}`, 7))}`,
    icon: "📝",
  });

async function handleEvent(ev: LineEvent) {
  const userId = ev.source?.userId ?? "";
  const replyToken = ev.replyToken ?? "";
  if (!userId || !replyToken) return;

  // Anyone who talks to the OA gets captured so the owner can bind them from /rooms.
  await rememberContact(userId).catch((e) => console.error("[line] rememberContact:", e));

  if (ev.type === "follow") {
    await replyMessages(replyToken, [
      { type: "text", text: "ขอบคุณที่เพิ่มเพื่อนค่ะ 🙏\nกดปุ่มด้านล่างเพื่อลงทะเบียนรับใบแจ้งหนี้ทาง LINE" },
      registerFlex(userId),
    ]);
    return;
  }

  if (ev.type === "message") {
    if (ev.message?.type !== "text") return replyText(replyToken, MENU_TEXT);
    return handleTextCommand(userId, replyToken, ev.message.text ?? "");
  }

  if (ev.type === "postback") return handlePostback(userId, replyToken, ev.postback?.data ?? "");
}

// ponytail: profile fetch on every event — one OA, low traffic; cache if it ever matters.
async function rememberContact(userId: string) {
  const { displayName } = await getProfile(userId).catch(() => ({ displayName: undefined }));
  await sql()`
    INSERT INTO line_contacts (line_user_id, display_name) VALUES (${userId}, ${displayName ?? null})
    ON CONFLICT (line_user_id) DO UPDATE
      SET display_name = COALESCE(EXCLUDED.display_name, line_contacts.display_name), last_seen = now()`;
}

async function handleTextCommand(userId: string, replyToken: string, raw: string) {
  const text = raw.trim();

  const reg = text.match(/^(?:ลงทะเบียน|register|reg)\s+(\S+)\s+(\d{4})$/i);
  if (reg) return replyText(replyToken, await registerTenant(userId, reg[1], reg[2]));

  if (/^(?:id|userid|ไอดี)$/i.test(text))
    return replyText(replyToken, `LINE User ID ของคุณคือ:\n${userId}`);

  if (/^(?:บิล|บิลล่าสุด|ใบแจ้งหนี้|invoice)$/i.test(text))
    return replyLatestInvoice(userId, replyToken);

  // "ลงทะเบียน" alone or any malformed variant → send the form button.
  if (/^(?:ลงทะเบียน|register|reg)/i.test(text))
    return replyMessages(replyToken, [registerFlex(userId)]);

  return replyText(replyToken, MENU_TEXT);
}

// Carried from GAS: phone-last-4 check prevents hijacking someone else's room.
async function registerTenant(userId: string, roomNo: string, last4: string): Promise<string> {
  const t = (
    await sql()<{ id: number; full_name: string; phone: string | null; room_no: string }[]>`
      SELECT t.id, t.full_name, t.phone, r.room_no
      FROM tenants t JOIN rooms r ON t.room_id = r.id
      WHERE r.room_no_norm = ${normalizeRoomNo(roomNo)} AND t.is_active = 1`
  )[0];
  if (!t) return `ลงทะเบียนไม่สำเร็จค่ะ\n\nไม่พบห้อง ${roomNo} หรือห้องยังไม่มีผู้เช่าในระบบ`;
  if (!t.phone?.endsWith(last4))
    return "ลงทะเบียนไม่สำเร็จค่ะ\n\nเลขท้ายเบอร์โทรไม่ตรงกับข้อมูลผู้เช่า กรุณาติดต่อเจ้าของหอ";

  // line_user_id is unique — clear any previous binding of this LINE account first.
  await sql().begin((tx) => [
    tx`UPDATE tenants SET line_user_id = NULL WHERE line_user_id = ${userId}`,
    tx`UPDATE tenants SET line_user_id = ${userId} WHERE id = ${t.id}`,
  ]);
  return (
    `ลงทะเบียนสำเร็จค่ะ\n\nห้อง: ${t.room_no}\nชื่อผู้เช่า: ${t.full_name}\n\n` +
    "หลังจากนี้ระบบจะส่งใบแจ้งหนี้มาที่ LINE นี้ค่ะ"
  );
}

async function replyLatestInvoice(userId: string, replyToken: string) {
  const inv = (
    await sql()<{
      id: number; invoice_no: string; room_no: string; period: string;
      tenant_name: string | null; due_date: string | null; total: number;
    }[]>`
      SELECT i.id, i.invoice_no, i.room_no, i.period, i.tenant_name, i.due_date, i.total
      FROM invoices i JOIN tenants t ON i.tenant_id = t.id
      WHERE t.line_user_id = ${userId} AND i.status = 'issued'
      ORDER BY i.created_at DESC LIMIT 1`
  )[0];
  if (!inv) {
    return replyText(
      replyToken,
      "ยังไม่พบใบแจ้งหนี้ของคุณค่ะ\n\nถ้ายังไม่ได้ลงทะเบียน พิมพ์:\nลงทะเบียน เลขห้อง เลขท้ายเบอร์โทร4หลัก"
    );
  }
  const items = await sql()<{ description: string; amount: number }[]>`
    SELECT description, amount FROM invoice_items WHERE invoice_id = ${inv.id} ORDER BY id`;
  await replyMessages(replyToken, [
    invoiceFlexMessage({
      invoiceNo: inv.invoice_no,
      roomNo: inv.room_no,
      periodLabel: fmtPeriod(inv.period),
      tenantName: inv.tenant_name,
      dueDate: inv.due_date,
      items,
      total: inv.total,
      invoiceUrl: `${baseUrl()}/t/invoice?token=${encodeURIComponent(signPayload(`invoice|${inv.id}`, 90))}`,
    }),
  ]);
}

async function handlePostback(userId: string, replyToken: string, data: string) {
  if (data === "ACTION_ID") return replyText(replyToken, `LINE User ID ของคุณคือ:\n${userId}`);

  if (data === "ACTION_REGISTER") return replyMessages(replyToken, [registerFlex(userId)]);

  if (data === "ACTION_LATEST_INVOICE") return replyLatestInvoice(userId, replyToken);

  if (data === "ACTION_COMPLAINT") {
    // ponytail: single-dorm UX — unregistered users get the first dorm's complaint form.
    const dormId =
      (
        await sql()<{ dorm_id: number }[]>`
          SELECT r.dorm_id FROM tenants t JOIN rooms r ON t.room_id = r.id
          WHERE t.line_user_id = ${userId} AND t.is_active = 1`
      )[0]?.dorm_id ?? (await sql()<{ id: number }[]>`SELECT id FROM dorms ORDER BY id LIMIT 1`)[0]?.id;
    if (!dormId) return replyText(replyToken, "ระบบยังไม่พร้อมใช้งานค่ะ");
    return replyMessages(replyToken, [
      openPageFlexMessage({
        title: "ร้องเรียน / แจ้งซ่อม",
        detail: "แจ้งปัญหาห้องพัก น้ำ ไฟ เสียงรบกวน หรือเรื่องอื่น ๆ",
        buttonLabel: "เปิดหน้าแจ้งซ่อม",
        url: `${baseUrl()}/t/complaint?token=${encodeURIComponent(signPayload(`complaint|${dormId}`, 30))}`,
        color: "#EA580C",
        icon: "📣",
      }),
    ]);
  }

  return replyText(replyToken, "ไม่พบคำสั่งนี้ค่ะ กรุณาเลือกเมนูอีกครั้ง");
}

const baseUrl = () => process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
