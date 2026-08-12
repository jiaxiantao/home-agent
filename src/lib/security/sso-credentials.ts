import {
  getSsoCookieNames,
  getSsoTokenHeaderNames,
  parseCookieValue,
  primaryHeaderForCookie,
} from "@/lib/security/sso-config";

export type SsoCredentials = {
  token: string;
  tokenHeader: string;
  /** 供上游 HTTP 复用的 Cookie 头（仅 SSO 相关键） */
  cookieHeader?: string;
};

/** Edge / Node 均可用的 FNV-1a 指纹（proxy 中不可用 node:crypto） */
export function hashSsoToken(token: string) {
  let h1 = 2_166_136_261;
  let h2 = 2_166_136_261;
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16_777_619);
    h2 ^= code + i;
    h2 = Math.imul(h2, 16_777_619);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

export function extractSsoCredentials(headers: Headers): SsoCredentials | null {
  for (const headerName of getSsoTokenHeaderNames()) {
    const token = headers.get(headerName)?.trim();
    if (token) {
      return { token, tokenHeader: headerName };
    }
  }

  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const pairs: string[] = [];
  let primary: SsoCredentials | null = null;

  for (const cookieName of getSsoCookieNames()) {
    const value = parseCookieValue(cookieHeader, cookieName);
    if (!value) {
      continue;
    }
    pairs.push(`${cookieName}=${value}`);
    if (!primary) {
      primary = {
        token: value,
        tokenHeader: primaryHeaderForCookie(cookieName),
        cookieHeader: pairs.join("; "),
      };
    } else if (primary.cookieHeader) {
      primary.cookieHeader = pairs.join("; ");
    }
  }

  return primary;
}
