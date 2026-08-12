import { SiteConsoleLayout } from "@/components/site-console-layout";
import { SiteShell } from "@/components/site-shell";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteShell>
      <SiteConsoleLayout>{children}</SiteConsoleLayout>
    </SiteShell>
  );
}
