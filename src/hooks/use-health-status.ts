"use client";

import { useEffect, useState } from "react";

export type HealthStatus = {
  ok: boolean;
  ready: boolean;
  db: { connected: boolean; ok: boolean; latencyMs: number };
  llm: { configured: boolean; label: string };
  search: { pgTrgm: boolean };
  agent?: { maxSteps: number };
};

export function useHealthStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as HealthStatus;
        if (!cancelled) {
          setHealth(data);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const timer = window.setInterval(load, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { health, loading };
}
