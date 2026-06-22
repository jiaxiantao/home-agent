import Link from "next/link";

import { SiteHealthBadge } from "@/components/site-health-badge";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
        <Link
          href="/agents"
          className="text-sm font-semibold tracking-[0.24em] text-white transition hover:text-cyan-100"
        >
          HOME AGENT
        </Link>
        <div className="flex items-center gap-4">
          <SiteHealthBadge />
          <nav className="text-sm text-slate-300">
            <Link href="/agents" className="transition hover:text-white">
              Agent 编排
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
