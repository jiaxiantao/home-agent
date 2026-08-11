"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type EnvProfile = {
  id: string;
  label: string;
  configured: boolean;
  host?: string;
  database?: string;
};

export function AgentEnvSwitcher({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (env: string) => void;
  disabled?: boolean;
}) {
  const [profiles, setProfiles] = useState<EnvProfile[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/envs")
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const data = (await response.json()) as {
            profiles?: EnvProfile[];
            defaultEnv?: string;
          };
          const nextProfiles = data.profiles ?? [];
          setProfiles(nextProfiles);

          const stored = value?.trim();
          const storedProfile = nextProfiles.find(
            (item) => item.id === stored && item.configured,
          );
          const defaultProfile =
            nextProfiles.find((item) => item.id === data.defaultEnv && item.configured) ??
            nextProfiles.find((item) => item.configured);

          if (storedProfile) {
            return;
          }

          if (defaultProfile) {
            onChange(defaultProfile.id);
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

  const selected = profiles.find((item) => item.id === value);
  const label = selected?.label ?? value ?? "测试";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || profiles.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={
          selected?.configured
            ? `${selected.host ?? ""} / ${selected.database ?? ""}`
            : "选择大风车数据环境（测试 / 预发 / 线上）"
        }
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex max-w-[132px] items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition disabled:opacity-40",
          open
            ? "bg-white/[0.08] text-zinc-100"
            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
        )}
      >
        <span className="shrink-0 text-zinc-600">环境</span>
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
          aria-label="数据环境"
          className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[248px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#161618] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          <div className="border-b border-white/[0.06] px-3 py-2">
            <p className="text-[11px] font-medium text-zinc-300">数据环境</p>
            <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">
              切换测试 / 预发 / 线上 MySQL 实例
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                role="option"
                aria-selected={value === profile.id}
                disabled={!profile.configured}
                onClick={() => {
                  if (!profile.configured) {
                    return;
                  }
                  onChange(profile.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                  value === profile.id ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                    value === profile.id
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
                    <span className="truncate text-[12px] text-zinc-200">
                      {profile.label}
                    </span>
                    {!profile.configured ? (
                      <span className="shrink-0 rounded px-1 py-px text-[9px] tracking-wide text-zinc-500 ring-1 ring-white/[0.08]">
                        未配置
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-zinc-500">
                    {profile.configured
                      ? `${profile.host ?? profile.id} · ${profile.database ?? "—"}`
                      : "请在服务端配置 ANALYTICS_MYSQL_* 连接信息"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
