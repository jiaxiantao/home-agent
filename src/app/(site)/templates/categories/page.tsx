import type { Metadata } from "next";

import { ConsoleShell } from "@/components/console-shell";
import { TeamTemplateCategoriesManagement } from "@/components/team-template-categories-management";

export const metadata: Metadata = {
  title: "分类管理",
  description: "管理团队模板分类",
};

export default function TemplateCategoriesPage() {
  return (
    <ConsoleShell hideHeader>
      <TeamTemplateCategoriesManagement />
    </ConsoleShell>
  );
}
