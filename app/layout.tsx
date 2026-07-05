import type { Metadata } from "next";
import { Prompt, Sarabun } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
});

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "หอพร้อม — ระบบจัดการหอพัก",
  description: "บริหารหอพักอย่างมืออาชีพ ออกบิลอัตโนมัติ ติดตามการชำระเงิน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`h-full ${prompt.variable} ${sarabun.variable}`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
