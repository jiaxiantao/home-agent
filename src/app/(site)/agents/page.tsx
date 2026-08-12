import type { Metadata } from "next";

import { AgentsOrchestratorSection } from "@/components/agents-orchestrator-section";
import { ConsoleShell } from "@/components/console-shell";
import {
  PRODUCT_MISSION,
  PRODUCT_NAME_EN,
  PRODUCT_NAME_ZH,
  PRODUCT_TAGLINE,
} from "@/lib/product";

export const metadata: Metadata = {
  title: PRODUCT_NAME_EN,
  description: `${PRODUCT_NAME_ZH}（${PRODUCT_NAME_EN}）。${PRODUCT_MISSION}`,
};

export default function AgentsPage() {
  return (
    <ConsoleShell
      title={PRODUCT_NAME_ZH}
      description={`${PRODUCT_NAME_EN} · ${PRODUCT_TAGLINE}`}
      hideHeader
    >
      <AgentsOrchestratorSection />
    </ConsoleShell>
  );
}
