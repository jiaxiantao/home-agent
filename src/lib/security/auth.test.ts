import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthUserFromHeaders, validateAuthToken } from "@/lib/security/auth";

describe("auth", () => {
  const previousMode = process.env.AUTH_MODE;
  const previousToken = process.env.AUTH_TOKEN;
  const previousUserId = process.env.AUTH_DEFAULT_USER_ID;
  const previousUserName = process.env.AUTH_DEFAULT_USER_NAME;

  afterEach(() => {
    if (previousMode === undefined) {
      delete process.env.AUTH_MODE;
    } else {
      process.env.AUTH_MODE = previousMode;
    }

    if (previousToken === undefined) {
      delete process.env.AUTH_TOKEN;
    } else {
      process.env.AUTH_TOKEN = previousToken;
    }

    if (previousUserId === undefined) {
      delete process.env.AUTH_DEFAULT_USER_ID;
    } else {
      process.env.AUTH_DEFAULT_USER_ID = previousUserId;
    }

    if (previousUserName === undefined) {
      delete process.env.AUTH_DEFAULT_USER_NAME;
    } else {
      process.env.AUTH_DEFAULT_USER_NAME = previousUserName;
    }
  });

  it("returns dev user when auth disabled", () => {
    process.env.AUTH_MODE = "disabled";
    const user = resolveAuthUserFromHeaders(new Headers());
    expect(user?.userId).toBe("dev");
  });

  it("validates bearer token", () => {
    process.env.AUTH_MODE = "token";
    process.env.AUTH_TOKEN = "secret-token";
    process.env.AUTH_DEFAULT_USER_ID = "u001";
    process.env.AUTH_DEFAULT_USER_NAME = "Alice";

    const headers = new Headers({
      authorization: "Bearer secret-token",
    });

    expect(resolveAuthUserFromHeaders(headers)).toMatchObject({
      userId: "u001",
      userName: "Alice",
    });
    expect(validateAuthToken("secret-token")).toMatchObject({ userId: "u001" });
  });

  it("reads trusted headers", () => {
    process.env.AUTH_MODE = "trusted_header";
    const headers = new Headers({
      "x-home-agent-user-id": "sso-123",
      "x-home-agent-user-name": "Bob",
    });

    expect(resolveAuthUserFromHeaders(headers)).toMatchObject({
      userId: "sso-123",
      userName: "Bob",
    });
  });
});
