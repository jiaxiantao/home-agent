import { AsyncLocalStorage } from "node:async_hooks";

import type { SsoCredentials } from "@/lib/security/sso-credentials";

const ssoStore = new AsyncLocalStorage<SsoCredentials | null>();

export function runWithSsoRequestContext<T>(
  credentials: SsoCredentials | null,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return ssoStore.run(credentials, fn);
}

export function getSsoRequestContext(): SsoCredentials | null {
  return ssoStore.getStore() ?? null;
}
