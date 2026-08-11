import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">
          Internal Access
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">企业内网登录</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          使用管理员分配的访问令牌登录问数助手。若公司已接入 SSO 网关，请从统一入口访问。
        </p>
        <div className="mt-6">
          <Suspense fallback={<p className="text-sm text-slate-500">加载中…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
