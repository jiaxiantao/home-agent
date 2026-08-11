"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type DatabaseOption = {
  name: string;
  description: string;
  domain: string;
  accessible: boolean;
  isDefault: boolean;
};

export function AgentDatabaseSwitcher({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (database: string) => void;
  disabled?: boolean;
}) {
  const [databases, setDatabases] = useState<DatabaseOption[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/databases")
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const data = (await response.json()) as {
            databases?: DatabaseOption[];
          };
          setDatabases(data.databases ?? []);
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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

  const selected = databases.find((item) => item.name === value);
  const label = value ? value : "自动规划";
  const hint = value
    ? selected?.description || "已指定偏好库（Agent 仍会按问题校验）"
    : "由 Agent 根据问题自动选择数据库";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={hint}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex max-w-[168px] items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition disabled:opacity-40",
          open
            ? "bg-white/[0.08] text-zinc-100"
            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
        )}
      >
        <span className="shrink-0 text-zinc-600">库</span>
        <span className="truncate text-zinc-300">{label}</span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={cn(
            "h-2.5 w-2.5 shrink-0 text-zinc-600 transition",
            open && "rotate-180",
          )}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="偏好数据库"
          className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[272px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#161618] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          <div className="border-b border-white/[0.06] px-3 py-2">
            <p className="text-[11px] font-medium text-zinc-300">查询范围</p>
            <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">
              默认交给 Agent 自动规划，一般无需手动指定
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <OptionRow
              selected={!value}
              title="自动规划"
              subtitle="推荐 · 按问题语义选库选表"
              badge="推荐"
              onSelect={() => {
                onChange("");
                setOpen(false);
              }}
            />

            {databases.map((item) => (
              <OptionRow
                key={item.name}
                selected={value === item.name}
                title={item.name}
                subtitle={item.description}
                badge={!item.accessible ? "不可见" : undefined}
                muted={!item.accessible}
                onSelect={() => {
                  onChange(item.name);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OptionRow({
  selected,
  title,
  subtitle,
  badge,
  muted,
  onSelect,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  badge?: string;
  muted?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2 text-left transition",
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
        muted && "opacity-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-zinc-200 bg-zinc-100 text-zinc-950"
            : "border-white/15 text-transparent",
        )}
        aria-hidden
      >
        <svg viewBox="0 0 12 12" className="h-2 w-2">
          <path
            d="M2.5 6.2L4.8 8.5L9.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12px] text-zinc-200">{title}</span>
          {badge ? (
            <span className="shrink-0 rounded px-1 py-px text-[9px] tracking-wide text-zinc-500 ring-1 ring-white/[0.08]">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-zinc-500">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
