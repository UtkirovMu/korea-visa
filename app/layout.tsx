import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

// CSP nonce har so'rovda yangilanadi, shuning uchun sahifalar dinamik render qilinadi.
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-inter" });

const siteUrl = (process.env.SITE_URL || "").split(",")[0]?.trim();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "Viza holatini tekshirish — Turan Int. School",
  description: "Koreya vizasi arizangiz holatini pasport ma'lumotlari orqali bir necha soniyada tekshiring.",
  applicationName: "Turan Int. School",
  openGraph: {
    title: "Viza holatini tekshirish — Turan Int. School",
    description: "Koreya vizasi arizangiz holatini bir necha soniyada tekshiring.",
    type: "website",
    locale: "uz_UZ",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBB03B",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
