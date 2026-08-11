import { isRedisConfigured } from "@/lib/redis/client";
import { getAuthMode, isAuthEnabled } from "@/lib/security/auth-config";
import { getTableAllowlist } from "@/lib/security/table-allowlist";
import { isLlmConfigured } from "@/lib/llm-config";

export function isProductionStrict() {
  const flag = process.env.PRODUCTION_STRICT?.toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

export function collectProductionIssues() {
  const issues: string[] = [];

  if (!isProductionStrict()) {
    return issues;
  }

  if (!isAuthEnabled()) {
    issues.push("AUTH_MODE 不能为 disabled（生产必须启用鉴权）");
  }

  const allowlist = getTableAllowlist();
  if (!allowlist?.size) {
    issues.push("必须配置 ANALYTICS_MYSQL_TABLE_ALLOWLIST（表白名单）");
  }

  if (process.env.REDIS_REQUIRED === "1" && !isRedisConfigured()) {
    issues.push("必须配置 REDIS_URL（多实例会话与限流）");
  }

  if (process.env.LLM_REQUIRE === "1" && !isLlmConfigured()) {
    issues.push("必须启用 LLM（LLM_REQUIRE=1 时不允许规则回退）");
  }

  if (getAuthMode() === "trusted_header" && !process.env.TRUSTED_PROXY_ONLY) {
    issues.push(
      "trusted_header 模式建议设置 TRUSTED_PROXY_ONLY=1，并仅允许 SSO 网关访问",
    );
  }

  return issues;
}

export function validateProductionConfig(options?: { throwOnError?: boolean }) {
  const issues = collectProductionIssues();

  if (!issues.length) {
    return { ok: true as const, issues };
  }

  const message = `[production-config] 生产配置未就绪：\n- ${issues.join("\n- ")}`;

  if (options?.throwOnError) {
    throw new Error(message);
  }

  console.warn(message);
  return { ok: false as const, issues };
}
