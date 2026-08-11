import type { AgentToolName } from "@/lib/agent/types";

export type UserRole = "analyst" | "admin";

const ADMIN_ONLY_TOOLS: AgentToolName[] = ["sample_table_rows"];

export function resolveUserRole(userId: string): UserRole {
  const admins = (process.env.AUTH_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return admins.includes(userId) ? "admin" : "analyst";
}

export function isToolAllowedForUser(tool: AgentToolName, userId?: string) {
  if (!ADMIN_ONLY_TOOLS.includes(tool)) {
    return true;
  }

  if (!userId) {
    return false;
  }

  return resolveUserRole(userId) === "admin";
}

export function toolAccessDeniedMessage(tool: AgentToolName) {
  return `工具 ${tool} 仅管理员可用（联系管理员加入 AUTH_ADMIN_USER_IDS）`;
}
