import {
  extractSsoCredentials,
  type SsoCredentials,
} from "@/lib/security/sso-credentials";
import {
  getDevSsoCredentials,
  parseCookieValue,
} from "@/lib/security/sso-config";

/** 侧栏「同步大风车登录」写入的 Cookie 名，与 Mars `_security_token` 一致 */
export const DFC_SSO_SESSION_COOKIE = "_security_token";

/** 旧版侧栏 Cookie 名，读取/清除时兼容迁移 */
export const DFC_SSO_SESSION_COOKIE_LEGACY = "dfc_sso_token";

/** SSO 凭证优先级：侧栏 _security_token → 请求头/浏览器 Mars Cookie → DFC_API_DEV_SSO_TOKEN */
export function resolveSsoCredentialsFromRequest(
  headers: Headers,
): SsoCredentials | null {
  const fromRequest = extractSsoCredentials(headers);
  if (fromRequest) {
    return fromRequest;
  }

  const cookieHeader = headers.get("cookie");
  if (cookieHeader) {
    const legacyToken = parseCookieValue(cookieHeader, DFC_SSO_SESSION_COOKIE_LEGACY);
    if (legacyToken) {
      return {
        token: legacyToken,
        tokenHeader: "Souche-Security-Token",
        cookieHeader: `${DFC_SSO_SESSION_COOKIE}=${legacyToken}`,
      };
    }
  }

  return getDevSsoCredentials();
}

export type DfcUserProfile = {
  userId?: string;
  userName?: string;
  shopCode?: string;
  shopName?: string;
  phone?: string;
  linked: boolean;
  source?: "matador" | "sso" | "session" | "dev";
};

type MatadorResult<T> = {
  success?: boolean;
  data?: T;
  code?: string;
  msg?: string;
};

function resolveMatadorBaseUrl() {
  return (
    process.env.DFC_API_MATADOR_BASE_URL?.trim() ||
    "https://matador.dasouche.net"
  ).replace(/\/$/, "");
}

function resolveSsoUserInfoUrl() {
  return (
    process.env.DFC_SSO_USER_INFO_URL?.trim() ||
    "https://sso.dasouche.net/api/user/query/findUserInfoByToken.json"
  );
}

function buildSsoHeaders(sso: SsoCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  headers[sso.tokenHeader] = sso.token;
  if (sso.cookieHeader) {
    headers.Cookie = sso.cookieHeader;
  }
  return headers;
}

async function fetchMatadorLoginUser(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile> | null> {
  const url = `${resolveMatadorBaseUrl()}/api/web/workbench/common/commonApi/queryLoginUserInfo`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: buildSsoHeaders(sso),
      signal: controller.signal,
    });
    const payload = (await response.json()) as MatadorResult<{
      loginUserId?: string;
      loginUserName?: string;
      loginUserPhone?: string;
    }>;

    if (!response.ok || !payload.success || !payload.data) {
      return null;
    }

    return {
      userId: payload.data.loginUserId,
      userName: payload.data.loginUserName,
      phone: payload.data.loginUserPhone,
      source: "matador",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSsoTokenUser(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile> | null> {
  const url = resolveSsoUserInfoUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const body = new URLSearchParams({ token: sso.token });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    const payload = (await response.json()) as {
      success?: boolean;
      code?: string;
      data?: {
        account?: string;
        nickname?: string;
        phone?: string;
        shopCode?: string;
      };
    };

    if (!response.ok || payload.success === false || !payload.data) {
      return null;
    }

    const data = payload.data;
    return {
      userId: data.account,
      userName: data.nickname || data.account,
      phone: data.phone,
      shopCode: data.shopCode,
      source: "sso",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMatadorDfcName(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile> | null> {
  const url = `${resolveMatadorBaseUrl()}/api/h5/user/userInfoApi/nameAndPhone`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        ...buildSsoHeaders(sso),
        "x-channel": "dfc",
      },
      signal: controller.signal,
    });
    const payload = (await response.json()) as MatadorResult<{
      name?: string;
      phone?: string;
    }>;

    if (!response.ok || !payload.success || !payload.data) {
      return null;
    }

    return {
      userName: payload.data.name,
      phone: payload.data.phone,
      source: "matador",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveDfcUserProfile(
  headers: Headers,
): Promise<DfcUserProfile | null> {
  const sso = resolveSsoCredentialsFromRequest(headers);
  if (!sso) {
    return null;
  }

  const [workbenchUser, ssoUser, dfcName] = await Promise.all([
    fetchMatadorLoginUser(sso),
    fetchSsoTokenUser(sso),
    fetchMatadorDfcName(sso),
  ]);

  const merged: DfcUserProfile = {
    userId: workbenchUser?.userId ?? ssoUser?.userId,
    userName:
      workbenchUser?.userName ?? dfcName?.userName ?? ssoUser?.userName,
    phone: workbenchUser?.phone ?? dfcName?.phone ?? ssoUser?.phone,
    shopCode: ssoUser?.shopCode,
    shopName: ssoUser?.shopName,
    source:
      workbenchUser?.source ?? dfcName?.source ?? ssoUser?.source ?? "session",
    linked: false,
  };

  merged.linked = Boolean(merged.userName || merged.userId);
  return merged.linked ? merged : null;
}
