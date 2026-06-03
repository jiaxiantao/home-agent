"use client";

import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [authOpen, setAuthOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { authenticated, loading, message, clearMessage, login, logout } = useAuth();

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
    const ok = await login(username, password);
    if (!ok) {
      return;
    }
    setPassword("");
    setAuthOpen(false);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
        <Link
          href="/agents"
          className="text-sm font-semibold tracking-[0.24em] text-white"
        >
          HOME AGENT
        </Link>

        <nav className="flex items-center gap-4 text-sm text-slate-300">
          <Link href="/agents" className="transition hover:text-white">
            Agent 编排
          </Link>
          <button
            type="button"
            onClick={() => setAuthOpen((value) => !value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold uppercase transition",
              authenticated
                ? "border-emerald-200/40 bg-emerald-300/15 text-emerald-100"
                : "border-cyan-200/40 bg-cyan-300/10 text-cyan-100",
            )}
          >
            {loading ? "..." : authenticated ? "admin" : "游客"}
          </button>
        </nav>
      </div>

      {authOpen ? (
        <div className="border-t border-white/10 bg-slate-950/95 px-6 py-4">
          {authenticated ? (
            <div className="mx-auto flex max-w-md flex-col gap-3">
              <p className="text-sm text-emerald-200">已登录，Agent 偏好可同步到数据库。</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="w-fit rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200"
              >
                退出登录
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleLogin}
              className="mx-auto grid max-w-md gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="管理员账号"
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="密码"
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40"
              />
              <button
                type="submit"
                className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                登录
              </button>
            </form>
          )}
          {message ? <p className="mt-3 text-sm text-cyan-200/90">{message}</p> : null}
        </div>
      ) : null}
    </header>
  );
}
