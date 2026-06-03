import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
        <Link
          href="/agents"
          className="text-sm font-semibold tracking-[0.24em] text-white"
        >
          HOME AGENT
        </Link>
        <nav className="text-sm text-slate-300">
          <Link href="/agents" className="transition hover:text-white">
            Agent 编排
          </Link>
        </nav>
      </div>
    </header>
  );
}
