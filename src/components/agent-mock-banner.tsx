"use client";

export function AgentMockBanner({
  visible,
  label,
}: {
  visible: boolean;
  label?: string | null;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      {label ?? "当前使用规则规划器（LLM 未启用或调用失败），请核对 SQL 与结果口径。"}
    </div>
  );
}
