import { runWithSsoRequestContext } from "@/lib/security/sso-context";
import { resolveSsoCredentialsFromRequest } from "@/lib/security/dfc-user-profile";

export function runDfcApiTestWithRequestSso<T>(
  request: Request,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const sso = resolveSsoCredentialsFromRequest(request.headers);
  return runWithSsoRequestContext(sso, fn);
}
