"use client";

import { useEffect, useRef, type RefObject } from "react";

import { AgentEnvSwitcher } from "@/components/agent-env-switcher";
import { AgentDatabaseSwitcher } from "@/components/agent-database-switcher";
import { cn } from "@/lib/utils";

export function AgentComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  onReset,
  running,
  hasConversation,
  analyticsEnv,
  onAnalyticsEnvChange,
  analyticsDatabase,
  onAnalyticsDatabaseChange,
  quickPrompts,
  onQuickPrompt,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onReset: () => void;
  running: boolean;
  hasConversation: boolean;
  analyticsEnv: string;
  onAnalyticsEnvChange: (env: string) => void;
  analyticsDatabase: string;
  onAnalyticsDatabaseChange: (database: string) => void;
  quickPrompts: Array<{ id: string; label: string; prompt: string }>;
  onQuickPrompt: (prompt: string, runImmediately?: boolean) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) {
      return;
    }

    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function setTextareaNode(node: HTMLTextAreaElement | null) {
    localRef.current = node;
    if (inputRef) {
      inputRef.current = node;
    }
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-1 border-t border-white/[0.06] bg-[#0a0a0c]/92 px-1 pt-3 pb-1 backdrop-blur-md">
      {!hasConversation ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickPrompts.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onQuickPrompt(item.prompt)}
              onDoubleClick={() => onQuickPrompt(item.prompt, true)}
              title="双击立即运行"
              className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-white/15 hover:bg-white/[0.04] hover:text-zinc-200"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/[0.1] bg-[#121214] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_8px_30px_rgba(0,0,0,0.35)] focus-within:border-white/20">
        <textarea
          ref={setTextareaNode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              if (!running) {
                onSubmit();
              }
            }
          }}
          rows={1}
          placeholder={
            hasConversation
              ? "继续追问，例如：那按城市分布呢？"
              : "用自然语言提问，例如：正式车源一共有多少辆？"
          }
          className="max-h-40 w-full resize-none bg-transparent px-3.5 pt-3 pb-2 text-[13px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
        />

        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AgentDatabaseSwitcher
              value={analyticsDatabase}
              onChange={onAnalyticsDatabaseChange}
              disabled={running}
            />
            <AgentEnvSwitcher
              value={analyticsEnv}
              onChange={onAnalyticsEnvChange}
              disabled={running}
            />
            <button
              type="button"
              onClick={onReset}
              disabled={running}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-40"
            >
              新对话
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-zinc-600 sm:inline">
              ⌘↵ 发送
            </span>
            {running ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:bg-white/[0.08]"
                title="停止 (Esc)"
              >
                <span className="h-2.5 w-2.5 rounded-[2px] bg-zinc-200" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!value.trim()}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                  "bg-zinc-100 text-zinc-950 hover:bg-white",
                )}
              >
                {hasConversation ? "发送" : "问数"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
