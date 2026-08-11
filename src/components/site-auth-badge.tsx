"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AuthMe = {
  authenticated: boolean;
  user?: { userId: string; userName?: string };
  authMode?: string;
};

export function SiteAuthBadge() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthMe | null>(null);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) {
          setAuth({ authenticated: false });
          return;
        }
        setAuth((await response.json()) as AuthMe);
      })
      .catch(() => setAuth({ authenticated: false }));
  }, []);

  if (!auth?.authenticated || auth.authMode === "disabled") {
    return null;
  }

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="hidden sm:inline">
        {auth.user?.userName ?? auth.user?.userId}
      </span>
      {auth.authMode === "token" ? (
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-full border border-white/10 px-2.5 py-1 transition hover:text-white"
        >
          退出
        </button>
      ) : null}
    </div>
  );
}
