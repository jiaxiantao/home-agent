export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[#0a0a0c] bg-[radial-gradient(circle_at_top,rgba(255,102,0,0.18),transparent_36%),linear-gradient(180deg,#0a0a0c_0%,#0c0a08_55%,#0a0a0c_100%)]"
      />
      <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}
