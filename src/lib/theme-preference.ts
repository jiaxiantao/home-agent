export const THEME_STORAGE_KEY = "dfc-data-agent-theme";

export const COLOR_THEMES = ["light", "dark"] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

export const DEFAULT_COLOR_THEME: ColorTheme = "light";

export function parseColorTheme(value: unknown): ColorTheme | null {
  if (value === "light" || value === "dark") {
    return value;
  }
  return null;
}

export function readStoredColorTheme(): ColorTheme {
  if (typeof window === "undefined") {
    return DEFAULT_COLOR_THEME;
  }

  try {
    return parseColorTheme(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_COLOR_THEME;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

export function storeColorTheme(theme: ColorTheme) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function applyColorTheme(theme: ColorTheme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute("data-theme", theme);
}

/** 在首屏绘制前同步主题，避免闪白/闪黑 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;
