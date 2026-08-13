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
    <div className="mb-2 rounded-lg border border-brand/25 bg-brand/[0.08] px-3 py-2 text-[12px] text-brand-soft">
      {label ?? "当前使用规则规划器，请核对 SQL 与结果口径。"}
    </div>
  );
}
