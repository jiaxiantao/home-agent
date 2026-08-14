export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden className="app-canvas pointer-events-none fixed inset-0 z-0" />
      <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}
