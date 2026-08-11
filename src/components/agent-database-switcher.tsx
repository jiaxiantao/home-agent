"use client";

import { useEffect, useState } from "react";

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
  const [defaultDatabase, setDefaultDatabase] = useState("matador");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/databases")
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const data = (await response.json()) as {
            databases?: DatabaseOption[];
            defaultDatabase?: string;
          };
          setDatabases(data.databases ?? []);
          if (data.defaultDatabase) {
            setDefaultDatabase(data.defaultDatabase);
          }
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const current = value || defaultDatabase;

  return (
    <label className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-500">
      <span className="shrink-0">业务库</span>
      <select
        value={current}
        disabled={disabled || !databases.length}
        onChange={(event) => onChange(event.target.value)}
        title={
          databases.find((item) => item.name === current)?.description ??
          "选择偏好分析库"
        }
        className="max-w-[140px] truncate rounded-md border border-white/[0.08] bg-transparent px-1.5 py-1 text-[11px] text-zinc-300 outline-none hover:border-white/15 disabled:opacity-40"
      >
        {databases.length ? (
          databases.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
              {item.isDefault ? " · 默认" : ""}
              {!item.accessible ? " · 不可见" : ""}
            </option>
          ))
        ) : (
          <option value={defaultDatabase}>{defaultDatabase}</option>
        )}
      </select>
    </label>
  );
}
