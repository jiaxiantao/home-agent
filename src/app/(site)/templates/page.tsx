import type { Metadata } from "next";

import { ConsoleShell } from "@/components/console-shell";
import { TeamTemplatesManagement } from "@/components/team-templates-management";

export const metadata: Metadata = {
  title: "团队模板",
  description: "管理团队问法模板，按触发次数排序",
};

export default function TeamTemplatesPage() {
  return (
    <ConsoleShell hideHeader>
      <TeamTemplatesManagement />
    </ConsoleShell>
  );
}
