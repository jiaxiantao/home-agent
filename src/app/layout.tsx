import type { Metadata } from "next";

import {
  PRODUCT_MISSION,
  PRODUCT_NAME_EN,
  PRODUCT_NAME_ZH,
} from "@/lib/product";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: PRODUCT_NAME_EN,
    template: `%s | ${PRODUCT_NAME_EN}`,
  },
  description: `${PRODUCT_NAME_ZH}（${PRODUCT_NAME_EN}）。${PRODUCT_MISSION}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="relative min-h-full flex flex-col bg-transparent">
        {children}
      </body>
    </html>
  );
}
