import type { Metadata } from "next";

import { AgentSessionsManagement } from "@/components/agent-sessions-management";
import { ConsoleShell } from "@/components/console-shell";

export const metadata: Metadata = {
  title: "历史会话",
  description: "查看并继续 Agent 历史对话",
};

export default function AgentSessionsPage() {
  return (
    <ConsoleShell hideHeader>
      <AgentSessionsManagement />
    </ConsoleShell>
  );
}
