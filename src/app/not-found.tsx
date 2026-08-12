import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-soft/80">
          404
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          页面不存在
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          请从问数助手页继续。
        </p>
        <Link
          href="/agents"
          className="mt-8 inline-flex rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          前往问数助手
        </Link>
      </div>
    </div>
  );
}
