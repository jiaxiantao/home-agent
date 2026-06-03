export function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="animate-pulse rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-8"
      aria-hidden
    >
      <div className="h-3 w-24 rounded-full bg-white/10" />
      <div className="mt-6 h-8 w-2/3 max-w-md rounded-full bg-white/10" />
      <div className="mt-8 grid gap-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className="h-4 rounded-full bg-white/5"
            style={{ width: `${88 - index * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}
