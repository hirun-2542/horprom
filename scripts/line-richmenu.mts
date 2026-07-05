// LINE rich menu setup — ported from Version Excel (RichMenu.gs).
// Usage:
//   npm run richmenu -- <image.png|jpg>     create menu + upload image + set as default
//   npm run richmenu -- --generate          render a default 2500x1686 menu image (scripts/richmenu.png)
//   npm run richmenu -- --delete-all        delete every rich menu on the OA
import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ก่อน (export $(grep -v '^#' .env.local | xargs))");
  process.exit(1);
}

const api = async (url: string, init: RequestInit = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}: ${await res.text()}`);
  return res;
};

// Same 4 areas/postbacks as the GAS menu — the webhook handles these ACTION_* codes.
const MENU = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "HorProm Main Menu",
  chatBarText: "เมนูหอพัก",
  areas: [
    { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: "postback", label: "LINE ID", data: "ACTION_ID", displayText: "id" } },
    { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: "postback", label: "ลงทะเบียน", data: "ACTION_REGISTER", displayText: "ลงทะเบียน" } },
    { bounds: { x: 0, y: 843, width: 1250, height: 843 }, action: { type: "postback", label: "บิลล่าสุด", data: "ACTION_LATEST_INVOICE", displayText: "บิล" } },
    { bounds: { x: 1250, y: 843, width: 1250, height: 843 }, action: { type: "postback", label: "ร้องเรียน", data: "ACTION_COMPLAINT", displayText: "ร้องเรียน" } },
  ],
};

async function generateImage(outPath: string) {
  // ponytail: SVG → PNG via sharp (already ships with Next). Warm web-theme colors.
  const { default: sharp } = await import("sharp");
  const cell = (x: number, y: number, icon: string, label: string) => `
    <g transform="translate(${x},${y})">
      <rect x="30" y="30" width="1190" height="783" rx="40" fill="#ffffff" stroke="#e8ddcc" stroke-width="6"/>
      <text x="625" y="400" font-size="200" text-anchor="middle">${icon}</text>
      <text x="625" y="620" font-size="110" font-weight="bold" text-anchor="middle" fill="#322818"
        font-family="Noto Sans Thai, Sarabun, sans-serif">${label}</text>
    </g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2500" height="1686">
    <rect width="2500" height="1686" fill="#faf5ec"/>
    ${cell(0, 0, "🆔", "LINE ID")}
    ${cell(1250, 0, "📝", "ลงทะเบียน")}
    ${cell(0, 843, "🧾", "บิลล่าสุด")}
    ${cell(1250, 843, "📣", "แจ้งซ่อม / ร้องเรียน")}
  </svg>`;
  writeFileSync(outPath, await sharp(Buffer.from(svg)).png().toBuffer());
  console.log(`สร้างรูปเมนูแล้ว: ${outPath}`);
}

async function deleteAll() {
  const list = await (await api("https://api.line.me/v2/bot/richmenu/list")).json();
  for (const m of list.richmenus ?? []) {
    await api(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { method: "DELETE" });
    console.log(`ลบ rich menu: ${m.richMenuId}`);
  }
  console.log(`ลบแล้ว ${list.richmenus?.length ?? 0} เมนู`);
}

async function create(imagePath: string) {
  const image = readFileSync(imagePath);
  const contentType = imagePath.match(/\.jpe?g$/i) ? "image/jpeg" : "image/png";

  const { richMenuId } = await (
    await api("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(MENU),
    })
  ).json();
  console.log(`สร้าง rich menu: ${richMenuId}`);

  await api(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(image),
  });
  console.log("อัปโหลดรูปแล้ว");

  await api(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST" });
  console.log("ตั้งเป็นเมนูหลักของทุกคนแล้ว ✅");
}

const arg = process.argv[2];
if (arg === "--delete-all") await deleteAll();
else if (arg === "--generate") await generateImage(new URL("./richmenu.png", import.meta.url).pathname);
else if (arg) await create(arg);
else {
  console.log("ใช้: npm run richmenu -- <image.png> | --generate | --delete-all");
  process.exit(1);
}
