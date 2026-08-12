import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";
import { SsoLoginButton } from "@/components/sso-login-button";
import { BRAND_LOGO_PATH } from "@/lib/product";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border border-brand/20 bg-brand/[0.04] p-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND_LOGO_PATH}
            alt="大风车"
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl"
          />
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-brand/80">
              DFC Data Agent
            </p>
            <h1 className="text-xl font-semibold text-white">登录问数助手</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          大风车接口调用需要 SSO 登录态。请使用大风车统一账号登录；若已接入 SSO
          网关，也可从统一入口访问本应用。
        </p>

        <div className="mt-6 space-y-4">
          <Suspense fallback={null}>
            <SsoLoginPanel />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

function SsoLoginPanel() {
  return (
    <>
      <SsoLoginButton />
      <details className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
        <summary className="cursor-pointer text-slate-300">使用访问令牌（管理员）</summary>
        <div className="mt-4">
          <LoginForm compact />
        </div>
      </details>
    </>
  );
}
