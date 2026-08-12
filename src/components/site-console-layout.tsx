"use client";

import { usePathname } from "next/navigation";

import { ConsoleSidebar } from "@/components/console-sidebar";

export function SiteConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/agents";
  const isAuthPage =
    pathname === "/login" ||
    pathname.startsWith("/login/");

  if (isAuthPage) {
    return (
      <div className="flex h-screen overflow-hidden text-foreground">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden text-foreground">
      <ConsoleSidebar activePath={pathname} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
