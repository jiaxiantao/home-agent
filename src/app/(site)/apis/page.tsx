import type { Metadata } from "next";

import { DfcApisManagement } from "@/components/dfc-apis-management";
import { ConsoleShell } from "@/components/console-shell";

export const metadata: Metadata = {
  title: "大风车接口目录",
  description: "浏览并测试大风车 HTTP / Dubbo 接口可达性",
};

export default function DfcApisPage() {
  return (
    <ConsoleShell hideHeader>
      <DfcApisManagement />
    </ConsoleShell>
  );
}
