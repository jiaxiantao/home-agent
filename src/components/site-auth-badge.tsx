"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SsoLoginButton } from "@/components/sso-login-button";

type AuthMe = {
  authenticated: boolean;
  user?: { userId: string; userName?: string };
  authMode?: string;
};

export function SiteAuthBadge() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [authMode, setAuthMode] = useState<string>("disabled");

  useEffect(() => {
    void fetch("/api/auth/config")
      .then(async (response) => {
        if (response.ok) {
          const config = (await response.json()) as { authMode?: string };
          if (config.authMode) {
            setAuthMode(config.authMode);
          }
        }
      })
      .catch(() => undefined);

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

  if (authMode === "disabled") {
    return null;
  }

  if (!auth?.authenticated) {
    if (authMode === "sso") {
      return (
        <SsoLoginButton
          className="rounded-full border border-brand/30 px-2.5 py-1 text-xs text-brand-soft transition hover:bg-brand/10"
          label="登录"
        />
      );
    }
    return null;
  }

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    if (authMode === "sso") {
      window.location.href = "/login";
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">
        {auth.user?.userName ?? auth.user?.userId}
      </span>
      {authMode === "token" ? (
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-full border border-border px-2.5 py-1 transition hover:text-foreground"
        >
          退出
        </button>
      ) : authMode === "sso" ? (
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">
          SSO
        </span>
      ) : null}
    </div>
  );
}
