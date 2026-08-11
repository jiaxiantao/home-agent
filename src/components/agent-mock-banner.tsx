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
    <div className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-100/90">
      {label ?? "当前使用规则规划器（LLM 未启用或调用失败），请核对 SQL 与结果口径。"}
    </div>
  );
}
