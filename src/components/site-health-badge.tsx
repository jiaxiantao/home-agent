"use client";

import { useHealthStatus } from "@/hooks/use-health-status";
import { cn } from "@/lib/utils";

function StatusDot({
  ok,
  label,
  title,
}: {
  ok: boolean;
  label: string;
  title?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400"
      title={title ?? label}
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

  const mysql = health.analyticsMysql;
  const mysqlOk = Boolean(mysql?.configured && mysql.ok);
  const mysqlLabel = !mysql?.configured
    ? "分析库未配置"
    : mysqlOk
      ? `分析库 · ${mysql.database ?? "mysql"}`
      : "分析库异常";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <StatusDot
        ok={mysqlOk}
        label={mysqlLabel}
        title={
          mysql?.error
            ? `analyticsMysql: ${mysql.error}`
            : mysqlOk
              ? `env=${mysql?.env} latency=${mysql?.latencyMs}ms`
              : "大风车 matador MySQL"
        }
      />
      <StatusDot
        ok={health.db.ok}
        label={health.db.ok ? "应用库" : "应用库异常"}
        title="Prisma Postgres（笔记等元数据）"
      />
      <StatusDot
        ok={health.llm.configured}
        label={health.llm.configured ? health.llm.label : "规则模式"}
        title={health.llm.label}
      />
      {health.search.pgTrgm ? <StatusDot ok label="pg_trgm" /> : null}
    </div>
  );
}
