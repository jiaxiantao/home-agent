"use client";

import { useHealthStatus } from "@/hooks/use-health-status";
import { cn } from "@/lib/utils";

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400"
      title={label}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-amber-400",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function SiteHealthBadge() {
  const { health, loading } = useHealthStatus();

  if (loading) {
    return (
      <span className="inline-flex h-5 w-20 animate-pulse rounded-full bg-white/10" aria-hidden />
    );
  }

  if (!health) {
    return <StatusDot ok={false} label="服务离线" />;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <StatusDot ok={health.db.ok} label={health.db.ok ? "DB" : "DB 异常"} />
      <StatusDot
        ok={health.llm.configured}
        label={health.llm.configured ? "LLM" : "规则模式"}
      />
      {health.search.pgTrgm ? <StatusDot ok label="pg_trgm" /> : null}
    </div>
  );
}
