import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
          404
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          页面不存在
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          请从 Agent 编排页继续。
        </p>
        <Link
          href="/agents"
          className="mt-8 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
        >
          前往 Agents
        </Link>
      </div>
    </div>
  );
}
