import { PRODUCT_SLUG } from "@/lib/product";

export type AuthMode = "disabled" | "token" | "trusted_header";

export type AuthUser = {
  userId: string;
  userName?: string;
  authMode: AuthMode;
};

const AUTH_COOKIE_NAME = "dfc_data_agent_session";

export function getAuthMode(): AuthMode {
  const raw = process.env.AUTH_MODE?.trim().toLowerCase();

  if (raw === "token" || raw === "trusted_header") {
    return raw;
  }

  return "disabled";
}

export function isAuthEnabled() {
  return getAuthMode() !== "disabled";
}

export function getAuthCookieName() {
  return AUTH_COOKIE_NAME;
}

export function getAuthTokenSecret() {
  return process.env.AUTH_TOKEN?.trim() ?? "";
}

/** token -> userId 映射，格式 userId:token,userId2:token2 */
export function getAuthTokenUsers(): Map<string, AuthUser> {
  const map = new Map<string, AuthUser>();
  const single = getAuthTokenSecret();

  if (single) {
    map.set(single, {
      userId: process.env.AUTH_DEFAULT_USER_ID?.trim() || "internal",
      userName: process.env.AUTH_DEFAULT_USER_NAME?.trim() || "Internal User",
      authMode: "token",
    });
  }

  const multi = process.env.AUTH_TOKENS?.trim();

  if (multi) {
    for (const entry of multi.split(",")) {
      const [userId, token] = entry.split(":").map((part) => part.trim());

      if (userId && token) {
        map.set(token, {
          userId,
          userName: userId,
          authMode: "token",
        });
      }
    }
  }

  return map;
}

export function getTrustedHeaderNames() {
  return {
    userId:
      process.env.AUTH_TRUSTED_USER_ID_HEADER?.trim() ||
      `x-${PRODUCT_SLUG}-user-id`,
    userName:
      process.env.AUTH_TRUSTED_USER_NAME_HEADER?.trim() ||
      `x-${PRODUCT_SLUG}-user-name`,
  };
}

export function assertAuthConfiguredForProduction() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (getAuthMode() === "disabled") {
    console.warn(
      "[security] AUTH_MODE=disabled in production — enable token or trusted_header before enterprise rollout",
    );
  }
}
