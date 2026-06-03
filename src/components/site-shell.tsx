export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[#020617] bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_32%),linear-gradient(180deg,#020617_0%,#020817_55%,#020617_100%)]"
      />
      <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
    </>
  );
}
