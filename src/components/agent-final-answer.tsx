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
    <section className="answer-enter group relative">
      <div className="absolute top-0 right-0 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => void copyAnswer()}
          className="rounded-md border border-border bg-code px-2 py-1 text-[10px] text-muted transition hover:border-brand/25 hover:text-brand-soft"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-7 text-foreground">
        {text}
        {running ? (
          <span className="streaming-cursor ml-0.5 text-muted">▍</span>
        ) : null}
      </p>
    </section>
  );
}
