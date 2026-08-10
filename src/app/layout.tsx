import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Home Agent",
    template: "%s | Home Agent",
  },
  description:
    "Dafengche data analysis agent: natural language to read-only SQL, HITL confirm, tables and charts via A2UI.",
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
