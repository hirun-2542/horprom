// LINE Messaging API adapter — live when LINE_CHANNEL_ACCESS_TOKEN is set.
// ponytail: no SDK — LINE is plain fetch. Flex layouts ported from Version Excel (LinePush.gs).
import { fmtMoney } from "./util";

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export const lineEnabled = () => Boolean(TOKEN);

export type LineMessage = Record<string, unknown>;

async function lineApi(path: string, body: unknown) {
  if (!TOKEN) {
    console.log(`[line-stub] ${path}: ${JSON.stringify(body).slice(0, 300)}`);
    return;
  }
  const res = await fetch(`https://api.line.me${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE ${path} HTTP ${res.status}: ${await res.text()}`);
}

// Display name of a user who has friended the OA; {} when unavailable.
export async function getProfile(userId: string): Promise<{ displayName?: string }> {
  if (!TOKEN) return {};
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.ok ? res.json() : {};
}

export const pushMessages = (to: string, messages: LineMessage[]) =>
  lineApi("/v2/bot/message/push", { to, messages });
export const replyMessages = (replyToken: string, messages: LineMessage[]) =>
  lineApi("/v2/bot/message/reply", { replyToken, messages });
export const replyText = (replyToken: string, text: string) =>
  replyMessages(replyToken, [{ type: "text", text }]);

const BRAND = "#D98E1F"; // marigold-500 — matches the web theme

const flexRow = (label: string, value: string) => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: label, size: "sm", color: "#666666", flex: 2 },
    { type: "text", text: value, size: "sm", color: "#111111", align: "end", wrap: true, flex: 3 },
  ],
});

const fmtDateTH = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

// Invoice bubble with real line items (GAS had fixed water/electric/wifi fields).
export function invoiceFlexMessage(args: {
  invoiceNo: string;
  roomNo: string;
  periodLabel: string;
  tenantName: string | null;
  dueDate: string | null;
  items: { description: string; amount: number }[];
  total: number;
  invoiceUrl: string; // signed /t/invoice link
}): LineMessage {
  const rows = [
    ...(args.tenantName ? [flexRow("ผู้เช่า", args.tenantName)] : []),
    ...(args.dueDate ? [flexRow("ครบกำหนดชำระ", fmtDateTH(args.dueDate))] : []),
    ...args.items.map((it) => flexRow(it.description, `${fmtMoney(it.amount)} บาท`)),
  ];
  return {
    type: "flex",
    altText: `ใบแจ้งหนี้ห้อง ${args.roomNo} ยอดรวม ${fmtMoney(args.total)} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        backgroundColor: BRAND,
        contents: [
          { type: "text", text: "ใบแจ้งหนี้ / INVOICE", color: "#FFFFFF", weight: "bold", size: "lg" },
          {
            type: "text",
            text: `ห้อง ${args.roomNo} | ประจำเดือน ${args.periodLabel}`,
            color: "#FFFFFF",
            size: "sm",
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "box", layout: "vertical", spacing: "sm", contents: rows },
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              { type: "text", text: "ยอดรวม", size: "md", weight: "bold", flex: 1 },
              {
                type: "text",
                text: `${fmtMoney(args.total)} บาท`,
                size: "xl",
                weight: "bold",
                align: "end",
                flex: 2,
                color: "#D32F2F",
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: BRAND,
            height: "sm",
            action: { type: "uri", label: "เปิดบิล / จ่ายผ่าน QR", uri: args.invoiceUrl },
          },
          {
            type: "text",
            text: "กดปุ่มเพื่อดูรายละเอียดและ QR พร้อมเพย์",
            size: "xs",
            color: "#888888",
            align: "center",
            wrap: true,
          },
        ],
      },
    },
  };
}

// "Open page" card — ported from replyOpenPageFlex_ (LineWebhook.gs).
export function openPageFlexMessage(args: {
  title: string;
  detail: string;
  buttonLabel: string;
  url: string;
  color?: string;
  icon?: string;
}): LineMessage {
  const color = args.color ?? BRAND;
  return {
    type: "flex",
    altText: args.title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: color,
        paddingAll: "20px",
        contents: [
          { type: "text", text: `${args.icon ?? ""} ${args.title}`.trim(), weight: "bold", size: "lg", color: "#FFFFFF" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [{ type: "text", text: args.detail, size: "sm", color: "#555555", wrap: true }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color,
            action: { type: "uri", label: args.buttonLabel, uri: args.url },
          },
        ],
      },
    },
  };
}

export async function pushInvoiceNotice(
  args: Parameters<typeof invoiceFlexMessage>[0] & { lineUserId: string }
): Promise<void> {
  await pushMessages(args.lineUserId, [invoiceFlexMessage(args)]);
}
