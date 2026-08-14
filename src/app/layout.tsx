import type { Metadata } from "next";
import Script from "next/script";

import { ThemeProvider } from "@/components/theme-provider";
import {
  PRODUCT_MISSION,
  PRODUCT_NAME_EN,
  PRODUCT_NAME_ZH,
} from "@/lib/product";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme-preference";

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
  icons: {
    icon: "/brand/dfc-logo.png",
    apple: "/brand/dfc-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      data-theme="light"
      suppressHydrationWarning
    >
      <body className="relative flex h-full flex-col overflow-hidden bg-transparent">
        <Script id="dfc-theme" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
