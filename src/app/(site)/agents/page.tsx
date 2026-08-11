import type { Metadata } from "next";

import { AgentsOrchestratorSection } from "@/components/agents-orchestrator-section";
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
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 lg:py-6">
      <header className="mb-4 flex items-end justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div>
          <h1 className="text-[15px] font-medium tracking-tight text-zinc-100">
            {PRODUCT_NAME_EN}
          </h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            {PRODUCT_NAME_ZH} · {PRODUCT_TAGLINE}
          </p>
        </div>
      </header>

      <AgentsOrchestratorSection />
    </main>
  );
}
