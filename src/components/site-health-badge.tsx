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
          "h-2 w-2 shrink-0 rounded-full",
          ok
            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]"
            : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.45)]",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function SiteHealthBadge({ layout = "inline" }: { layout?: "inline" | "sidebar" }) {
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
    ? "DB 未配置"
    : mysqlOk
      ? "DB"
      : "DB 异常";

  const llmOk = health.llm.configured && (health.llm.ok ?? true);
  const llmLabel = health.llm.configured
    ? "LLM"
    : health.llm.required
      ? "LLM ×"
      : "规则";

  const containerClass =
    layout === "sidebar"
      ? "flex flex-wrap items-center gap-1.5"
      : "flex flex-wrap items-center justify-end gap-1.5";

  return (
    <div className={containerClass}>
      <StatusDot
        ok={mysqlOk}
        label={mysqlLabel}
        title={
          mysql?.error
            ? `analyticsMysql: ${mysql.error}`
            : mysqlOk
              ? `env=${mysql?.env} host=${mysql?.host ?? "?"} latency=${mysql?.latencyMs}ms`
              : "大风车分析 MySQL"
        }
      />
      <StatusDot
        ok={llmOk}
        label={llmLabel}
        title={health.llm.error ?? health.llm.label ?? "LLM"}
      />
      {!health.ready ? (
        <StatusDot ok={false} label="未就绪" title="详见 /api/health" />
      ) : null}
    </div>
  );
}
