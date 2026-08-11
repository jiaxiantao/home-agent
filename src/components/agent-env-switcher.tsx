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
  }, [onChange, value]);

  if (profiles.length <= 1) {
    const only = profiles[0];
    return (
      <p className="text-[11px] text-slate-500">
        分析环境：{only?.label ?? value}
        {only?.database ? ` · ${only.database}` : ""}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-slate-500">分析环境</span>
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
          className={`rounded-full border px-2.5 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
            value === profile.id
              ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
              : "border-white/10 text-slate-400 hover:text-slate-200"
          }`}
        >
          {profile.label}
        </button>
      ))}
    </div>
  );
}
