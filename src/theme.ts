export type ThemeMode = "dark" | "light";

const darkTheme = {
  bg: {
    primary: "#000",
    secondary: "rgba(20, 20, 20, 0.9)",
    tertiary: "rgba(26, 26, 26, 0.95)",
    hover: "rgba(31, 31, 31, 0.95)",
    active: "rgba(37, 37, 37, 0.95)",
    solid: "#0D0D0D",
  },
  border: {
    subtle: "rgba(31, 31, 31, 0.8)",
    default: "rgba(42, 42, 42, 0.8)",
    strong: "rgba(51, 51, 51, 0.9)",
  },
  text: {
    primary: "#E8E2D9",
    secondary: "#A89F91",
    tertiary: "#6B6358",
    muted: "#4A453D",
  },
  accent: {
    primary: "#D4A574",
    secondary: "#C9956B",
    hover: "#E0B585",
  },
  semantic: {
    error: "#DC2626",
    errorMuted: "rgba(127, 29, 29, 0.5)",
    success: "#22C55E",
    successMuted: "rgba(20, 83, 45, 0.5)",
    warning: "#F59E0B",
    warningMuted: "rgba(120, 53, 15, 0.5)",
    info: "#3B82F6",
    infoMuted: "rgba(30, 58, 138, 0.5)",
  },
  terminal: {
    background: "rgba(0, 0, 0, 0)",
    foreground: "#E8E2D9",
    cursor: "#D4A574",
    cursorAccent: "#0D0D0D",
    selectionBackground: "rgba(212, 165, 116, 0.25)",
    black: "#1A1A1A",
    red: "#DC2626",
    green: "#22C55E",
    yellow: "#F59E0B",
    blue: "#3B82F6",
    magenta: "#A855F7",
    cyan: "#06B6D4",
    white: "#E8E2D9",
    brightBlack: "#4A453D",
    brightRed: "#EF4444",
    brightGreen: "#4ADE80",
    brightYellow: "#FBBF24",
    brightBlue: "#60A5FA",
    brightMagenta: "#C084FC",
    brightCyan: "#22D3EE",
    brightWhite: "#F5F5F4",
  },
  ui: {
    scrollbarThumb: "rgba(168, 159, 145, 0.2)",
    scrollbarThumbHover: "rgba(168, 159, 145, 0.35)",
    backdrop: "backdrop-blur-md",
  },
} as const;

const lightTheme = {
  bg: {
    primary: "#fff",
    secondary: "#faf9f9",
    tertiary: "#f0efed",
    hover: "#ebebeb",
    active: "#ebebeb",
    solid: "#F2F1ED",
  },
  border: {
    subtle: "rgba(221, 220, 216, 0.8)",
    default: "rgba(221, 220, 216, 1)",
    strong: "rgba(200, 199, 195, 1)",
  },
  text: {
    primary: "#262521",
    secondary: "rgba(38, 37, 33, 0.70)",
    tertiary: "rgba(38, 37, 33, 0.55)",
    muted: "rgba(38, 37, 33, 0.38)",
  },
  accent: {
    primary: "#262521",
    secondary: "rgba(38, 37, 33, 0.85)",
    hover: "#000000",
  },
  semantic: {
    error: "#DC2626",
    errorMuted: "rgba(254, 226, 226, 0.8)",
    success: "#22C55E",
    successMuted: "rgba(220, 252, 231, 0.8)",
    warning: "#F59E0B",
    warningMuted: "rgba(254, 243, 199, 0.8)",
    info: "#3B82F6",
    infoMuted: "rgba(219, 234, 254, 0.8)",
  },
  terminal: {
    background: "rgba(0, 0, 0, 0)",
    foreground: "#262521",
    cursor: "#262521",
    cursorAccent: "rgba(242, 241, 237, 0.95)",
    selectionBackground: "rgba(38, 37, 33, 0.16)",
    black: "#262521",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#eab308",
    blue: "#3b82f6",
    magenta: "#a855f7",
    cyan: "#06b6d4",
    white: "#262521",
    brightBlack: "rgba(38, 37, 33, 0.70)",
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#facc15",
    brightBlue: "#60a5fa",
    brightMagenta: "#c084fc",
    brightCyan: "#22d3ee",
    brightWhite: "#262521",
  },
  ui: {
    scrollbarThumb: "rgba(38, 37, 33, 0.15)",
    scrollbarThumbHover: "rgba(38, 37, 33, 0.25)",
    backdrop: "backdrop-blur-md",
  },
} as const;

export const themes = { dark: darkTheme, light: lightTheme };

export type Theme = typeof darkTheme | typeof lightTheme;

let currentMode: ThemeMode = "dark";
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  return themes[currentMode];
}

export function getThemeMode(): ThemeMode {
  return currentMode;
}

export function setThemeMode(mode: ThemeMode): void {
  currentMode = mode;
  listeners.forEach((fn) => fn());
}

export function toggleThemeMode(): void {
  setThemeMode(currentMode === "dark" ? "light" : "dark");
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initializeTheme(mode: ThemeMode): void {
  currentMode = mode;
  listeners.forEach((fn) => fn());
}
