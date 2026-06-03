"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AuthContextValue = {
  authenticated: boolean;
  loading: boolean;
  message: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearMessage: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const payload = (await response.json()) as { authenticated?: boolean };
      setAuthenticated(Boolean(payload.authenticated));
    } catch {
      setAuthenticated(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  async function login(username: string, password: string) {
    setMessage(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "登录失败");
      return false;
    }
    setAuthenticated(true);
    setMessage(null);
    return true;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setMessage("已退出登录");
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      authenticated,
      loading,
      message,
      login,
      logout,
      refresh,
      clearMessage: () => setMessage(null),
    }),
    [authenticated, loading, message],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
