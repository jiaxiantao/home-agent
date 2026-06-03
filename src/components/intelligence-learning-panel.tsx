"use client";

import {
  inferRecommendedPreferences,
  type IntelligenceHistoryEvent,
  type IntelligenceLearningProfile,
  type IntelligencePreferences,
} from "@/lib/front-intelligence-preferences";

export function IntelligenceLearningPanel({
  learningProfile,
  preferences,
  history,
  onApplyRecommendation,
  onResetLearning,
  onExport,
  onImport,
}: {
  learningProfile: IntelligenceLearningProfile;
  preferences: IntelligencePreferences;
  history: IntelligenceHistoryEvent[];
  onApplyRecommendation: (next: { style: IntelligencePreferences["style"]; depth: IntelligencePreferences["depth"] }) => void;
  onResetLearning: () => void;
  onExport: () => void;
  onImport: (value: string) => void;
}) {
  const recommended = inferRecommendedPreferences(learningProfile);

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">偏好学习画像</p>
      <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          风格得分：steps {learningProfile.styleScores.steps} / risk{" "}
          {learningProfile.styleScores.risk} / code {learningProfile.styleScores.code}
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          深度得分：brief {learningProfile.depthScores.brief} / detailed{" "}
          {learningProfile.depthScores.detailed}
        </div>
      </div>

      {recommended &&
      (recommended.style !== preferences.style ||
        recommended.depth !== preferences.depth) ? (
        <button
          type="button"
          onClick={() => onApplyRecommendation(recommended)}
          className="mt-3 rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-[11px] text-amber-100"
        >
          智能建议：改为 {recommended.style} / {recommended.depth}
        </button>
      ) : (
        <p className="mt-3 text-xs text-slate-500">学习样本不足或当前偏好已是最优推荐。</p>
      )}

      <button
        type="button"
        onClick={onResetLearning}
        className="mt-3 rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400"
      >
        重置学习画像
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExport}
          className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300"
        >
          导出配置
        </button>
        <label className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300">
          导入配置
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") {
                  onImport(reader.result);
                }
              };
              reader.readAsText(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">最近 20 次偏好</p>
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] text-slate-300">
          {history.length ? (
            [...history].reverse().map((item, index) => (
              <li key={`${item.at}-${index}`}>
                {new Date(item.at).toLocaleTimeString("zh-CN", { hour12: false })} ·{" "}
                {item.style}/{item.depth}/{item.includeMetrics ? "metric" : "plain"}
              </li>
            ))
          ) : (
            <li className="text-slate-500">暂无记录</li>
          )}
        </ul>
      </div>
    </div>
  );
}
