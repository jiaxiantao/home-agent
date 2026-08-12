import {
  getAuthCookieName,
  getAuthMode,
  getAuthTokenUsers,
  getTrustedHeaderNames,
  type AuthUser,
} from "@/lib/security/auth-config";
import {
  extractSsoCredentials,
  hashSsoToken,
} from "@/lib/security/sso-credentials";

function readBearerToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

function resolveTokenUser(token: string | null | undefined): AuthUser | null {
  if (!token) {
    return null;
  }

  return getAuthTokenUsers().get(token) ?? null;
}

export function resolveAuthUserFromHeaders(headers: Headers): AuthUser | null {
  const mode = getAuthMode();

  if (mode === "disabled") {
    return {
      userId: "dev",
      userName: "Development",
      authMode: "disabled",
    };
  }

  if (mode === "trusted_header") {
    const { userId, userName } = getTrustedHeaderNames();
    const resolvedUserId = headers.get(userId)?.trim();

    if (!resolvedUserId) {
      return null;
    }

    return {
      userId: resolvedUserId,
      userName: headers.get(userName)?.trim() || resolvedUserId,
      authMode: "trusted_header",
    };
  }

  if (mode === "sso") {
    const credentials = extractSsoCredentials(headers);
    if (!credentials) {
      return null;
    }

    const userIdHeader =
      process.env.SSO_USER_ID_HEADER?.trim() || "x-souche-user-id";
    const userNameHeader =
      process.env.SSO_USER_NAME_HEADER?.trim() || "x-souche-user-name";
    const resolvedUserId = headers.get(userIdHeader)?.trim();
    const resolvedUserName = headers.get(userNameHeader)?.trim();

    return {
      userId: resolvedUserId || `sso:${hashSsoToken(credentials.token)}`,
      userName: resolvedUserName || resolvedUserId || "大风车用户",
      authMode: "sso",
    };
  }

  const bearer = readBearerToken(headers.get("authorization"));
  const cookieToken = headers.get("cookie")
    ? parseCookieToken(headers.get("cookie")!)
    : null;
  const token = bearer ?? cookieToken;

  return resolveTokenUser(token);
}

function parseCookieToken(cookieHeader: string) {
  const cookieName = getAuthCookieName();

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === cookieName) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

export function validateAuthToken(token: string) {
  return resolveTokenUser(token.trim());
}

export function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
