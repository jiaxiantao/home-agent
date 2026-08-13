import type { Metadata } from "next";

import { AgentToolsManagement } from "@/components/agent-tools-management";
import { ConsoleShell } from "@/components/console-shell";

export const metadata: Metadata = {
  title: "工具管理",
  description: "查看并管理 Agent 可调用的工具",
};

export default function AgentToolsPage() {
  return (
    <ConsoleShell hideHeader>
      <AgentToolsManagement />
    </ConsoleShell>
  );
}
