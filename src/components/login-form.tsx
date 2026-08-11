"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error("访问令牌无效");
      }

      const next = searchParams.get("next") || "/agents";
      router.replace(next);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "登录失败",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <div>
        <label htmlFor="token" className="text-sm text-slate-300">
          访问令牌
        </label>
        <input
          id="token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="向管理员索取 AUTH_TOKEN"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/40"
          autoComplete="current-password"
          required
        />
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <button
        type="submit"
        disabled={loading || !token.trim()}
        className="w-full rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
      >
        {loading ? "验证中…" : "进入问数助手"}
      </button>
    </form>
  );
}
