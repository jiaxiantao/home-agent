"use client";

import { useState } from "react";

export function AgentFinalAnswer({
  text,
  running,
}: {
  text: string;
  running: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-emerald-100">分析结论</p>
        <button
          type="button"
          onClick={() => void copyAnswer()}
          className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300 transition hover:border-emerald-300/30 hover:text-white"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">
        {text}
        {running ? <span className="streaming-cursor ml-0.5 text-emerald-200">▍</span> : null}
      </p>
    </section>
  );
}
