/** 大风车 Mars / Jupiter 默认登录入口（测试外网） */
export const DEFAULT_SSO_LOGIN_URL =
  "https://f2e.dasouche.net/projects/jupiter-f2e/mars_web_business/index.html#/app/dashboard";

/** 侧栏账号区点击跳转：大风车账号登录/切换 */
export const DFC_MARS_ACCOUNT_URL =
  "https://f2e.dasouche.net/projects/jupiter-f2e/mars_web_business/index.html#/login?action=accountLogin";

export function getDfcMarsAccountUrl() {
  return process.env.DFC_MARS_ACCOUNT_URL?.trim() || DFC_MARS_ACCOUNT_URL;
}

export function getSsoLoginUrlBase() {
  return process.env.SSO_LOGIN_URL?.trim() || DEFAULT_SSO_LOGIN_URL;
}

export function getSsoReturnParamName() {
  return process.env.SSO_RETURN_PARAM?.trim() || "returnUrl";
}

/** 外网 _security_token / Souche-Security-Token；内网 _security_token_inc */
export function getSsoCookieNames(): string[] {
  const raw = process.env.SSO_COOKIE_NAMES?.trim();
  if (raw) {
    return raw.split(",").map((part) => part.trim()).filter(Boolean);
  }
  return ["_security_token", "_security_token_inc"];
}

export function getSsoTokenHeaderNames(): string[] {
  const raw = process.env.SSO_TOKEN_HEADERS?.trim();
  if (raw) {
    return raw.split(",").map((part) => part.trim()).filter(Boolean);
  }
  return ["Souche-Security-Token", "Souche-Security-Token-inc"];
}

export function primaryHeaderForCookie(cookieName: string) {
  if (cookieName.includes("_inc")) {
    return "Souche-Security-Token-inc";
  }
  return "Souche-Security-Token";
}

/**
 * 构建 SSO 登录跳转 URL，附带 returnUrl 供登录后回到问数助手。
 * Hash 路由（#/app/dashboard）保留在 query 之后。
 */
export function buildSsoLoginUrl(returnUrl: string) {
  const base = getSsoLoginUrlBase();
  const returnParam = getSsoReturnParamName();
  const hashIndex = base.indexOf("#");
  const beforeHash = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
  const hash = hashIndex >= 0 ? base.slice(hashIndex) : "";

  const url = new URL(beforeHash);
  url.searchParams.set(returnParam, returnUrl);
  return url.toString() + hash;
}

export function parseCookieValue(cookieHeader: string, name: string) {
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * 本地开发：从 DFC_API_DEV_SSO_TOKEN 注入测试环境 SSO（无需同域 Cookie）。
 * 优先级低于侧栏「同步大风车登录」写入的 _security_token Cookie。
 * 在 Mars 登录后，从 DevTools → Application → _security_token 复制。
 */
export function getDevSsoCredentials():
  | { token: string; tokenHeader: string; cookieHeader: string }
  | null {
  const token = process.env.DFC_API_DEV_SSO_TOKEN?.trim();
  if (!token) {
    return null;
  }

  const cookieName = process.env.DFC_API_DEV_SSO_COOKIE?.trim() || "_security_token";
  const tokenHeader =
    cookieName.includes("_inc") ? "Souche-Security-Token-inc" : "Souche-Security-Token";

  return {
    token,
    tokenHeader,
    cookieHeader: `${cookieName}=${token}`,
  };
}
