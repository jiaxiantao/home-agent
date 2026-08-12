"use client";

import { useEffect, useRef, type RefObject } from "react";

import { AgentModelSwitcher } from "@/components/agent-model-switcher";
import { cn } from "@/lib/utils";
import type { LlmProvider } from "@/lib/llm-config";

export function AgentComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  onReset,
  running,
  hasConversation,
  llmProvider,
  onLlmProviderChange,
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
  llmProvider: LlmProvider;
  onLlmProviderChange: (provider: LlmProvider) => void;
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
    <div className="shrink-0 border-t border-white/[0.05] bg-[#0a0a0c]/90 px-1 pt-3 pb-1 backdrop-blur-md">
      {!hasConversation ? (
        <div className="mb-2.5 flex flex-wrap gap-1">
          {quickPrompts.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onQuickPrompt(item.prompt)}
              onDoubleClick={() => onQuickPrompt(item.prompt, true)}
              title="双击立即运行"
              className="rounded-full px-2.5 py-1 text-[11px] text-zinc-500 transition hover:bg-brand/10 hover:text-brand-soft"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-2xl border border-white/[0.08] bg-[#111113]",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_36px_rgba(0,0,0,0.35)]",
          "transition focus-within:border-brand/30",
        )}
      >
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
              : "用自然语言提问，例如：客户 id 为 xxx 的客户信息"
          }
          className="max-h-40 w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[13px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
        />

        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-0.5">
            <AgentModelSwitcher
              value={llmProvider}
              onChange={onLlmProviderChange}
              disabled={running}
            />
            <button
              type="button"
              onClick={onReset}
              disabled={running}
              className="ui-btn-ghost"
            >
              新对话
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-zinc-600 sm:inline">
              ⌘↵
            </span>
            {running ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:bg-white/[0.08]"
                title="停止 (Esc)"
              >
                <span className="h-2.5 w-2.5 rounded-[2px] bg-zinc-200" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!value.trim()}
                className="ui-btn-primary h-8 px-3.5"
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
