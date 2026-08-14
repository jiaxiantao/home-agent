export function ConsoleShell({
  children,
  title,
  description,
  actions,
  hideHeader = false,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const showHeader = !hideHeader && (title || description || actions);

  return (
    <main className="flex h-full min-h-0 flex-col px-5 py-5 lg:px-7 lg:py-6">
      {showHeader ? (
        <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
          <div>
            {title ? (
              <h1 className="text-xl font-semibold text-foreground md:text-2xl">
                {title}
              </h1>
            ) : null}
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          hideHeader
            ? "overflow-hidden"
            : "overflow-y-auto [scrollbar-gutter:stable]"
        }`}
      >
        {children}
      </div>
    </main>
  );
}
