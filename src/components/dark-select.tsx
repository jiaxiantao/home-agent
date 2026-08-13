"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type DarkSelectOption = {
  value: string;
  label: string;
};

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
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected =
    options.find((item) => item.value === value) ??
    (value ? { value, label: value } : null);

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
          "flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-slate-200 outline-none transition hover:border-white/20 focus:border-brand/30 disabled:cursor-not-allowed disabled:opacity-40",
          buttonClassName,
        )}
      >
        <span className={cn("truncate", !selected && "text-slate-500")}>
          {selected?.label ?? placeholder}
        </span>
        <span
          className={cn(
            "shrink-0 text-[10px] text-slate-500 transition",
            open && "rotate-180 text-slate-300",
          )}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute z-[60] max-h-64 min-w-full overflow-y-auto rounded-xl border border-white/10 bg-slate-950 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
            placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((item) => {
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
                      : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {active ? (
                    <span className="shrink-0 text-[11px]" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
