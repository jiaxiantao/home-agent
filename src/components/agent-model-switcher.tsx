"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LlmProvider } from "@/lib/llm-config";
import { resolveDefaultLlmProvider } from "@/lib/llm-providers-catalog";
import { cn } from "@/lib/utils";

type ProviderOption = {
  id: LlmProvider;
  label: string;
  shortLabel: string;
  kind: "local" | "cloud";
  model: string;
  configured: boolean;
  ok?: boolean;
  error?: string;
  freeTier?: boolean;
  signupUrl?: string;
};

export function AgentModelSwitcher({
  value,
  onChange,
  disabled,
}: {
  value: LlmProvider;
  onChange: (provider: LlmProvider) => void;
  disabled?: boolean;
}) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/llm-providers")
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const data = (await response.json()) as {
            providers?: ProviderOption[];
            defaultProvider?: LlmProvider;
          };
          const next = data.providers ?? [];
          setProviders(next);

          const current = next.find((item) => item.id === value);
          if (current?.configured) {
            return;
          }

          const fallback =
            next.find((item) => item.id === data.defaultProvider && item.configured) ??
            next.find((item) => item.configured);
          if (fallback) {
            onChange(fallback.id);
          }
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onChange, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const displayValue = mounted ? value : resolveDefaultLlmProvider();
  const displaySelected: ProviderOption =
    providers.find((item) => item.id === displayValue) ?? {
      id: displayValue,
      label: displayValue === "ollama" ? "本地模型" : displayValue,
      shortLabel: displayValue === "ollama" ? "本地" : displayValue,
      kind: displayValue === "ollama" ? "local" : "cloud",
      model: "",
      configured: true,
    };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={`规划模型：${displaySelected.label}${displaySelected.model ? ` · ${displaySelected.model}` : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex max-w-[180px] items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition disabled:opacity-40",
          open
            ? "bg-white/[0.08] text-zinc-100"
            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
        )}
      >
        <span className="shrink-0 text-zinc-600">模型</span>
        <span className="truncate text-zinc-300" suppressHydrationWarning>
          {displaySelected.shortLabel}
        </span>
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            displaySelected.ok
              ? "bg-emerald-400"
              : displaySelected.configured
                ? "bg-amber-400"
                : "bg-zinc-600",
          )}
          aria-hidden
        />
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={cn(
            "h-2.5 w-2.5 shrink-0 text-zinc-600 transition",
            open && "rotate-180",
          )}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[280px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#161618] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          <div className="border-b border-white/[0.06] px-3 py-2 text-[10px] leading-5 text-zinc-500">
            切换规划模型（查询库由 Agent 自动选择）
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {providers.map((item) => {
              const active = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={!item.configured}
                  onClick={() => {
                    if (!item.configured) {
                      return;
                    }
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left transition",
                    active ? "bg-brand/10" : "hover:bg-white/[0.04]",
                    !item.configured && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      item.ok ? "bg-emerald-400" : item.configured ? "bg-amber-400" : "bg-zinc-600",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[12px] text-zinc-200">{item.label}</span>
                      {item.freeTier ? (
                        <span className="rounded bg-brand/15 px-1 py-0.5 text-[9px] text-brand-soft">
                          免费
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[10px] text-zinc-500">
                      {item.model || "—"}
                      {!item.configured
                        ? item.signupUrl
                          ? " · 请在 .env 配置 API Key"
                          : " · 未配置"
                        : item.error
                          ? ` · ${item.error}`
                          : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
