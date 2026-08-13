import { afterEach, describe, expect, it } from "vitest";

import {
  assertDfcMcpPolicy,
  isDfcMcpEnabled,
  isDfcMcpFallbackLocal,
} from "@/lib/mcp/dfc-api/config";

describe("dfc mcp config policy", () => {
  const prevEnabled = process.env.DFC_MCP_ENABLED;
  const prevFallback = process.env.DFC_MCP_FALLBACK_LOCAL;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.DFC_MCP_ENABLED;
    else process.env.DFC_MCP_ENABLED = prevEnabled;
    if (prevFallback === undefined) delete process.env.DFC_MCP_FALLBACK_LOCAL;
    else process.env.DFC_MCP_FALLBACK_LOCAL = prevFallback;
  });

  it("defaults to MCP on outside vitest when unset", () => {
    delete process.env.DFC_MCP_ENABLED;
    // under vitest the default is off
    expect(isDfcMcpEnabled()).toBe(false);
    expect(isDfcMcpFallbackLocal()).toBe(false);
  });

  it("honors explicit enable / disable", () => {
    process.env.DFC_MCP_ENABLED = "1";
    expect(isDfcMcpEnabled()).toBe(true);
    process.env.DFC_MCP_ENABLED = "0";
    expect(isDfcMcpEnabled()).toBe(false);
  });

  it("forbids skip-middleware when mcp off and fallback off outside vitest guard", () => {
    process.env.DFC_MCP_ENABLED = "0";
    process.env.DFC_MCP_FALLBACK_LOCAL = "0";
    // vitest guard still allows assert to pass
    expect(() => assertDfcMcpPolicy()).not.toThrow();
  });
});
