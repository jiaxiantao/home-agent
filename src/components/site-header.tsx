import Link from "next/link";

import { SiteAuthBadge } from "@/components/site-auth-badge";
import { SiteHealthBadge } from "@/components/site-health-badge";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link
          href="/agents"
          className="text-[12px] font-medium tracking-[0.18em] text-zinc-200 transition hover:text-white"
        >
          HOME AGENT
        </Link>
        <div className="flex items-center gap-3">
          <SiteHealthBadge />
          <SiteAuthBadge />
          <nav className="text-[12px] text-zinc-500">
            <Link href="/agents" className="transition hover:text-zinc-200">
              问数助手
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
