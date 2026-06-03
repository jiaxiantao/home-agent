import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_AUTH_COOKIE = "admin_token";

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

type AdminTokenPayload = {
  role: "admin";
  exp: number;
};

export class AdminAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AdminAuthError";
  }
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getAuthTokenSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET ?? process.env.ADMIN_SECRET;
  if (!secret) {
    throw new AdminAuthError("AUTH_TOKEN_SECRET is not configured");
  }
  return secret;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getAuthTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function parseCookieValue(cookieHeader: string, key: string) {
  const segments = cookieHeader.split(";").map((item) => item.trim());
  const target = segments.find((segment) => segment.startsWith(`${key}=`));
  if (!target) {
    return null;
  }
  return target.slice(key.length + 1) || null;
}

function parseAuthorizationToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

export function getAdminTokenFromRequest(request: Request) {
  const fromAuthorization = parseAuthorizationToken(request);
  if (fromAuthorization) {
    return fromAuthorization;
  }
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }
  return parseCookieValue(cookieHeader, ADMIN_AUTH_COOKIE);
}

export function getAdminCredentials() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new AdminAuthError("ADMIN_USERNAME or ADMIN_PASSWORD is not configured");
  }
  return { username, password };
}

export function verifyAdminLogin(username: string, password: string) {
  const credentials = getAdminCredentials();
  return username === credentials.username && password === credentials.password;
}

export function createAdminToken(now = Date.now()) {
  const payload: AdminTokenPayload = {
    role: "admin",
    exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminToken(token: string | null | undefined, now = Date.now()) {
  if (!token) {
    return false;
  }
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as AdminTokenPayload;
    if (payload.role !== "admin") {
      return false;
    }
    return payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function assertAdminTokenFromRequest(request: Request) {
  const token = getAdminTokenFromRequest(request);
  if (!verifyAdminToken(token)) {
    throw new AdminAuthError("Admin token is required");
  }
}
