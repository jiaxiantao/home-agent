"use client";

export function TemplateFavoriteButton({
  favorited,
  disabled,
  onToggle,
}: {
  favorited?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(favorited)}
      aria-label={favorited ? "取消收藏" : "加入我的收藏"}
      title={favorited ? "取消收藏" : "收藏到「我的收藏」"}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition disabled:opacity-40 ${
        favorited
          ? "text-amber-300 hover:bg-amber-400/10 hover:text-amber-200"
          : "text-muted hover:bg-surface-hover hover:text-amber-200"
      }`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
        {favorited ? (
          <path
            fill="currentColor"
            d="M10 2.5 12.2 7l4.9.7-3.55 3.46.84 4.88L10 13.9l-4.39 2.14.84-4.88L2.9 7.7 7.8 7 10 2.5Z"
          />
        ) : (
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            d="M10 3.2 12.05 7.3l4.5.66-3.26 3.18.77 4.48L10 13.5l-4.06 2.12.77-4.48L3.45 7.96l4.5-.66L10 3.2Z"
          />
        )}
      </svg>
    </button>
  );
}
