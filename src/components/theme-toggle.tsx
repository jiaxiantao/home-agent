"use client";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1",
        compact && "w-[9.5rem]",
      )}
      role="group"
      aria-label="主题"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        className={cn(
          "rounded-lg px-2 py-1.5 text-[11px] font-medium transition",
          theme === "light"
            ? "bg-elevated text-foreground shadow-sm"
            : "text-muted hover:text-foreground",
        )}
      >
        亮色
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        className={cn(
          "rounded-lg px-2 py-1.5 text-[11px] font-medium transition",
          theme === "dark"
            ? "bg-elevated text-foreground shadow-sm"
            : "text-muted hover:text-foreground",
        )}
      >
        暗黑
      </button>
    </div>
  );
}
