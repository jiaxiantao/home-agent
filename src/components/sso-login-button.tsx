"use client";

import { useEffect, useState } from "react";

type SsoLoginButtonProps = {
  returnUrl?: string;
  className?: string;
  label?: string;
};

export function SsoLoginButton({
  returnUrl,
  className = "w-full rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50",
  label = "前往大风车登录",
}: SsoLoginButtonProps) {
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  useEffect(() => {
    const targetReturn =
      returnUrl ||
      (typeof window !== "undefined" ? window.location.href : "/agents");

    void fetch("/api/auth/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl: targetReturn }),
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { loginUrl?: string };
        if (data.loginUrl) {
          setLoginUrl(data.loginUrl);
        }
      })
      .catch(() => undefined);
  }, [returnUrl]);

  function handleClick() {
    if (loginUrl) {
      window.location.href = loginUrl;
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={!loginUrl} className={className}>
      {loginUrl ? label : "加载登录地址…"}
    </button>
  );
}

export function useAuthConfig() {
  const [config, setConfig] = useState<{
    authMode?: string;
    ssoLoginUrl?: string;
    authEnabled?: boolean;
  } | null>(null);

  useEffect(() => {
    void fetch("/api/auth/config")
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        setConfig(await response.json());
      })
      .catch(() => setConfig(null));
  }, []);

  return config;
}
