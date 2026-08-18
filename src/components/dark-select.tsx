"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type DarkSelectOption = {
  value: string;
  label: string;
  badge?: string;
  badgeTone?: "success" | "warning" | "muted";
  mono?: boolean;
};

function badgeToneClass(tone: DarkSelectOption["badgeTone"]) {
  switch (tone) {
    case "success":
      return "border-emerald-500/35 bg-emerald-500/12 text-emerald-400";
    case "warning":
      return "border-amber-500/35 bg-amber-500/12 text-amber-400";
    default:
      return "border-border bg-surface text-muted";
  }
}

function SelectChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("h-3.5 w-3.5 shrink-0 text-muted transition", open && "rotate-180 text-foreground")}
      aria-hidden
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DarkSelect({
  value,
  options,
  onChange,
  placeholder = "请选择",
  className,
  buttonClassName,
  disabled,
  align = "left",
  placement = "bottom",
  searchable = false,
  searchPlaceholder = "搜索…",
  emptyLabel = "无匹配项",
}: {
  value: string;
  options: DarkSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  align?: "left" | "right";
  placement?: "top" | "bottom";
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected =
    options.find((item) => item.value === value) ??
    (value ? { value, label: value } : null);

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!searchable || !trimmed) {
      return options;
    }
    return options.filter(
      (item) =>
        item.label.toLowerCase().includes(trimmed) ||
        item.value.toLowerCase().includes(trimmed),
    );
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    if (searchable) {
      const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [open, searchable]);

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

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm text-foreground outline-none transition hover:border-border-strong focus:border-brand/30 disabled:cursor-not-allowed disabled:opacity-40",
          buttonClassName,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn("truncate", !selected && "text-muted")}>
            {selected?.label ?? placeholder}
          </span>
          {selected?.badge ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[10px]",
                badgeToneClass(selected.badgeTone),
              )}
            >
              {selected.badge}
            </span>
          ) : null}
        </span>
        <SelectChevron open={open} />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-[60] min-w-full overflow-hidden rounded-xl border border-border bg-elevated shadow-[var(--shadow-lg)]",
            placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            align === "right" ? "right-0" : "left-0",
            searchable ? "w-72" : "",
          )}
        >
          {searchable ? (
            <div className="border-b border-border p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-brand/30"
              />
            </div>
          ) : null}

          <ul
            id={listId}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filteredOptions.length ? (
              filteredOptions.map((item) => {
                const active = item.value === value;
                return (
                  <li key={item.value} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition",
                        active
                          ? "bg-brand/15 text-brand-soft"
                          : "text-foreground hover:bg-surface-hover hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          item.mono && "font-mono text-[12px]",
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {item.badge ? (
                          <span
                            className={cn(
                              "rounded-full border px-1.5 py-0.5 font-mono text-[10px]",
                              badgeToneClass(item.badgeTone),
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                        {active ? (
                          <span className="text-[11px]" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-4 text-center text-xs text-muted">{emptyLabel}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
