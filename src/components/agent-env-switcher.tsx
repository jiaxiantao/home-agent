"use client";

import { useEffect, useState } from "react";

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
          setProfiles(data.profiles ?? []);
          if (data.defaultEnv && !value) {
            onChange(data.defaultEnv);
          }
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onChange, value]);

  if (profiles.length <= 1) {
    const only = profiles[0];
    return (
      <span className="truncate text-[11px] text-zinc-500">
        {only?.label ?? value}
        {only?.database ? ` · ${only.database}` : ""}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {profiles.map((profile) => (
        <button
          key={profile.id}
          type="button"
          disabled={disabled || !profile.configured}
          title={
            profile.configured
              ? `${profile.host ?? ""} / ${profile.database ?? ""}`
              : "未配置连接信息"
          }
          onClick={() => onChange(profile.id)}
          className={`rounded-md px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
            value === profile.id
              ? "bg-white/[0.08] text-zinc-100"
              : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
        >
          {profile.label}
        </button>
      ))}
    </div>
  );
}
