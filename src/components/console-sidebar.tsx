"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { BRAND_LOGO_PATH, PRODUCT_NAME_EN } from "@/lib/product";
import { getDfcMarsAccountUrl } from "@/lib/security/sso-config";

const navItems = [
  { href: "/agents", label: "数据智能体" },
  { href: "/sessions", label: "历史会话" },
  { href: "/templates", label: "团队模板" },
  { href: "/tools", label: "工具管理" },
  { href: "/apis", label: "接口目录" },
];

const AVATAR_PALETTES = [
  "from-orange-400/90 to-orange-600/90",
  "from-orange-500/90 to-orange-700/90",
  "from-orange-300/90 to-orange-600/90",
  "from-yellow-500/90 to-orange-700/90",
  "from-orange-400/90 to-orange-500/90",
] as const;

type DfcUser = {
  userId?: string;
  userName?: string;
  shopCode?: string;
  shopName?: string;
  groupCode?: string;
  orgCode?: string;
  phone?: string;
  linked?: boolean;
  data?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

type AuthMe = {
  authenticated: boolean;
  user?: { userId: string; userName?: string };
  authMode?: string;
  dfcUser?: DfcUser | null;
  dfcLinked?: boolean;
};

function hashAccount(account: string) {
  let hash = 0;
  for (let i = 0; i < account.length; i += 1) {
    hash = (hash * 31 + account.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function avatarInitial(account: string) {
  if (/^\d{11}$/.test(account)) {
    return account.slice(-2);
  }
  if (account.includes("@")) {
    return account[0]?.toUpperCase() ?? "U";
  }
  return account.slice(-2) || "U";
}

function UserAvatar({ account }: { account: string }) {
  const palette = AVATAR_PALETTES[hashAccount(account) % AVATAR_PALETTES.length];
  const initial = avatarInitial(account);

  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette} text-xs font-semibold tracking-wide text-zinc-950 shadow-[0_0_0_1px_var(--border)]`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

function GuestAvatar() {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-sm text-muted"
      aria-hidden
    >
      ?
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-elevated p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-sm font-medium text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-brand/20 px-3 py-1.5 text-xs font-medium text-brand-soft transition hover:bg-brand/30 disabled:opacity-50"
          >
            {loading ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DfcTokenSyncPanel({
  onSynced,
}: {
  onSynced: (me: AuthMe) => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function syncToken(event: FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      return;
    }

    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sso-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const payload = (await response.json()) as AuthMe & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "同步失败");
        return;
      }
      const meResponse = await fetch("/api/auth/me");
      const me = (await meResponse.json()) as AuthMe;
      onSynced(me);
      setToken("");
      setOpen(false);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setSyncing(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-border bg-surface px-2 py-1.5 text-left text-[10px] text-muted transition hover:border-brand/25 hover:bg-brand/[0.04] hover:text-brand-soft"
      >
        本地开发 · 粘贴 Token 同步登录
      </button>
    );
  }

  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-surface p-2"
      onSubmit={(event) => void syncToken(event)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] leading-4 text-muted">
          从 Mars DevTools 复制{" "}
          <code className="rounded bg-surface-hover px-1 py-px font-mono text-[9px] text-foreground">
            _security_token
          </code>
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="shrink-0 text-[10px] text-muted-foreground transition hover:text-muted"
          aria-label="收起"
        >
          ✕
        </button>
      </div>
      <input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="粘贴 SSO Token"
        className="ui-input w-full px-2 py-1.5 text-[11px]"
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={syncing || !token.trim()}
        className="ui-btn-secondary w-full py-1.5 text-[11px]"
      >
        {syncing ? "验证中…" : "同步登录"}
      </button>
      {error ? <p className="text-[10px] leading-4 text-amber-400">{error}</p> : null}
    </form>
  );
}

function displayAccount(
  user: AuthMe["user"],
  dfcUser: DfcUser | null | undefined,
  authMode: string,
) {
  if (dfcUser?.linked && dfcUser.userName) {
    return dfcUser.userName;
  }
  if (!user) {
    return "未登录";
  }
  if (authMode === "disabled") {
    return user.userName ?? "本地开发";
  }
  return user.userName ?? user.userId;
}

function accountSubtitle(
  dfcUser: DfcUser | null | undefined,
  isDfcLinked: boolean,
  authMode: string,
) {
  if (isDfcLinked) {
    const shop =
      dfcUser?.shopName ||
      (dfcUser?.shopCode ? `门店 ${dfcUser.shopCode}` : "");
    const group = dfcUser?.groupCode ? `集团 ${dfcUser.groupCode}` : "";
    const label = [shop, group].filter(Boolean).join(" · ");
    if (label) {
      return `${label} · 点击切换 ↗`;
    }
    return "大风车账号 · 点击切换 ↗";
  }
  if (authMode === "disabled") {
    return "本地开发 · 点击登录 Mars ↗";
  }
  return "点击登录大风车 ↗";
}

export function ConsoleSidebar({ activePath }: { activePath: string }) {
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [authMode, setAuthMode] = useState("disabled");
  const [loading, setLoading] = useState(true);
  const [confirmClearSync, setConfirmClearSync] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [clearing, setClearing] = useState(false);
  const marsUrl = getDfcMarsAccountUrl();

  useEffect(() => {
    void Promise.all([
      fetch("/api/auth/config").then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as { authMode?: string };
      }),
      fetch("/api/auth/me").then(async (response) => {
        if (!response.ok) {
          return { authenticated: false } satisfies AuthMe;
        }
        return (await response.json()) as AuthMe;
      }),
    ])
      .then(([config, me]) => {
        if (config?.authMode) {
          setAuthMode(config.authMode);
        }
        setAuth(me ?? { authenticated: false });
      })
      .catch(() => setAuth({ authenticated: false }))
      .finally(() => setLoading(false));
  }, []);

  const dfcUser = auth?.dfcUser;
  const isDfcLinked = Boolean(auth?.dfcLinked ?? dfcUser?.linked);
  const accountLabel = displayAccount(auth?.user, dfcUser, authMode);
  const isLoggedIn =
    isDfcLinked || Boolean(auth?.authenticated && authMode !== "disabled");

  async function refreshAuthMe() {
    const meResponse = await fetch("/api/auth/me");
    if (!meResponse.ok) {
      setAuth({ authenticated: false });
      return;
    }
    setAuth((await meResponse.json()) as AuthMe);
  }

  async function clearDfcSync() {
    setClearing(true);
    try {
      await fetch("/api/auth/sso-token", { method: "DELETE" });
      await refreshAuthMe();
      setConfirmClearSync(false);
    } finally {
      setClearing(false);
    }
  }

  async function logout() {
    setClearing(true);
    try {
      await Promise.all([
        fetch("/api/auth/session", { method: "DELETE" }),
        fetch("/api/auth/sso-token", { method: "DELETE" }),
      ]);
      window.location.href = "/login";
    } finally {
      setClearing(false);
    }
  }

  return (
    <aside className="flex h-full w-[14rem] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar px-4 py-6">
      <Link
        href="/agents"
        className="flex min-w-0 items-center gap-2.5 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-foreground"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BRAND_LOGO_PATH}
          alt="大风车"
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-lg"
        />
        <span className="truncate whitespace-nowrap leading-none">
          {PRODUCT_NAME_EN}
        </span>
      </Link>

      <nav className="mt-5 grid min-w-0 gap-1">
        {navItems.map((item) => {
          const active =
            activePath === item.href || activePath.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-brand/15 text-brand-soft"
                  : "text-foreground hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto grid min-w-0 gap-4 px-2 pt-6">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-brand/30">
          {loading ? (
            <div className="flex min-w-0 items-center gap-2.5 p-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-hover" />
              <div className="h-3 min-w-0 flex-1 animate-pulse rounded bg-surface-hover" />
            </div>
          ) : (
            <>
              <a
                href={marsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-start gap-2.5 p-3 transition hover:bg-surface-hover"
                title="前往大风车 Mars 登录或切换账号"
              >
                {isLoggedIn ? (
                  <UserAvatar account={accountLabel} />
                ) : (
                  <GuestAvatar />
                )}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p
                    className="truncate text-sm font-medium text-foreground"
                    title={accountLabel}
                  >
                    {accountLabel}
                  </p>
                  <p
                    className="mt-0.5 truncate text-[11px] text-muted group-hover:text-brand-soft"
                    title={accountSubtitle(dfcUser, isDfcLinked, authMode)}
                  >
                    {accountSubtitle(dfcUser, isDfcLinked, authMode)}
                  </p>
                </div>
              </a>

              {authMode === "disabled" && !isDfcLinked ? (
                <div className="border-t border-border px-3 py-2.5">
                  <DfcTokenSyncPanel onSynced={setAuth} />
                </div>
              ) : null}

              {((authMode === "token" && isLoggedIn) || isDfcLinked) && (
                <div className="border-t border-border px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      isDfcLinked ? setConfirmClearSync(true) : setConfirmLogout(true)
                    }
                    className="text-xs text-muted transition hover:text-brand-soft"
                  >
                    {isDfcLinked ? "清除同步" : "退出登录"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="min-w-0 overflow-hidden">
          <ThemeToggle />
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearSync}
        title="清除大风车登录同步？"
        message="确认后将删除本地 Cookie 中的 _security_token，Agent 将不再使用已同步的 SSO Token。你可以稍后重新粘贴同步。"
        confirmLabel="确认清除"
        cancelLabel="取消"
        loading={clearing}
        onCancel={() => {
          if (!clearing) {
            setConfirmClearSync(false);
          }
        }}
        onConfirm={() => void clearDfcSync()}
      />

      <ConfirmDialog
        open={confirmLogout}
        title="退出登录？"
        message="确认后将清除登录状态并返回登录页。"
        confirmLabel="确认退出"
        cancelLabel="取消"
        loading={clearing}
        onCancel={() => {
          if (!clearing) {
            setConfirmLogout(false);
          }
        }}
        onConfirm={() => void logout()}
      />
    </aside>
  );
}
