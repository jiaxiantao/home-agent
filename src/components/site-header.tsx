import Link from "next/link";

import { SiteAuthBadge } from "@/components/site-auth-badge";
import { SiteHealthBadge } from "@/components/site-health-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { PRODUCT_NAME_EN } from "@/lib/product";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-header backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link
          href="/agents"
          className="text-[12px] font-medium uppercase tracking-[0.18em] text-foreground transition hover:text-foreground"
        >
          {PRODUCT_NAME_EN}
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <SiteHealthBadge />
          <SiteAuthBadge />
          <nav className="text-[12px] text-muted">
            <Link href="/agents" className="transition hover:text-foreground">
              数据智能体
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
