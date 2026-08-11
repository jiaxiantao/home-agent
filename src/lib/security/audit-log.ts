import type { AuthUser } from "@/lib/security/auth-config";
import { persistAudit } from "@/lib/security/audit-store";

export type AuditEventName =
  | "auth.denied"
  | "rate_limit.exceeded"
  | "agent.run.start"
  | "agent.run.resume"
  | "sql.proposed"
  | "sql.confirmed"
  | "sql.cancelled"
  | "sql.executed"
  | "sql.execution_failed";

export type AuditRecord = {
  ts: string;
  event: AuditEventName;
  userId?: string;
  userName?: string;
  clientIp?: string;
  userAgent?: string;
  runId?: string;
  threadId?: string;
  message?: string;
  sql?: string;
  explanation?: string;
  rowCount?: number;
  latencyMs?: number;
  outcome?: "success" | "failure" | "cancelled";
  error?: string;
  meta?: Record<string, unknown>;
};

export type AuditContext = {
  user: AuthUser;
  clientIp?: string;
  userAgent?: string;
  threadId?: string;
};

export function writeAudit(record: Omit<AuditRecord, "ts">) {
  const payload: AuditRecord = {
    ts: new Date().toISOString(),
    ...record,
  };

  console.info(JSON.stringify({ audit: payload }));
  void persistAudit(payload);
}

export function auditFromContext(
  context: AuditContext | undefined,
  record: Omit<
    AuditRecord,
    "ts" | "userId" | "userName" | "clientIp" | "userAgent" | "threadId"
  >,
) {
  writeAudit({
    userId: context?.user.userId,
    userName: context?.user.userName,
    clientIp: context?.clientIp,
    userAgent: context?.userAgent,
    threadId: context?.threadId,
    ...record,
  });
}
