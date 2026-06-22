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
    <section className="answer-enter rounded-2xl border border-cyan-300/25 bg-cyan-300/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            最终回答
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Agent 循环输出的合成结果</p>
        </div>
        <button
          type="button"
          onClick={() => void copyAnswer()}
          className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300 transition hover:border-cyan-300/30 hover:text-white"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
        {text}
        {running ? <span className="streaming-cursor ml-0.5 text-cyan-200">▍</span> : null}
      </p>
    </section>
  );
}
