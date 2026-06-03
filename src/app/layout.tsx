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
    "Frontend agent orchestration: plan, tool calls, and SSE traces with search_notes, calculate, and current_time.",
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
