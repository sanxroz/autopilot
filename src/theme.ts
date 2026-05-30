export type ThemeMode = "dark" | "light";

const darkTerminalTheme = {
  background: "rgba(0, 0, 0, 0)",
  foreground: "#FFFFFF",
  cursor: "#D4A574",
  cursorAccent: "#0D0D0D",
  selectionBackground: "rgba(212, 165, 116, 0.25)",
  black: "#616161",
  red: "#FF8272",
  green: "#B4FA72",
  yellow: "#FEFDC2",
  blue: "#A5D5FE",
  magenta: "#FF8FFD",
  cyan: "#D0D1FE",
  white: "#F1F1F1",
  brightBlack: "#8E8E8E",
  brightRed: "#FFC4BD",
  brightGreen: "#D6FCB9",
  brightYellow: "#FEFDD5",
  brightBlue: "#C1E3FE",
  brightMagenta: "#FFB1FE",
  brightCyan: "#E5E6FE",
  brightWhite: "#FEFFFF",
  surfaceBackground: "#000000",
} as const;

const lightTerminalTheme = {
  background: "rgba(0, 0, 0, 0)",
  foreground: "#111111",
  cursor: "#262521",
  cursorAccent: "rgba(242, 241, 237, 0.95)",
  selectionBackground: "rgba(38, 37, 33, 0.16)",
  black: "#212121",
  red: "#C30771",
  green: "#10A778",
  yellow: "#A89C14",
  blue: "#008EC4",
  magenta: "#523C79",
  cyan: "#20A5BA",
  white: "#E0E0E0",
  brightBlack: "#212121",
  brightRed: "#FB007A",
  brightGreen: "#5FD7AF",
  brightYellow: "#F3E430",
  brightBlue: "#20BBFC",
  brightMagenta: "#6855DE",
  brightCyan: "#4FB8CC",
  brightWhite: "#F1F1F1",
  surfaceBackground: "transparent",
} as const;

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
    ...darkTerminalTheme,
  },
  search: {
    matchBackground: "#785000",
    matchBorder: "#F59E0B",
    matchOverviewRuler: "#F59E0B",
    activeMatchBackground: "#F59E0B",
    activeMatchBorder: "#FBBF24",
    activeMatchColorOverviewRuler: "#FBBF24",
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
    ...lightTerminalTheme,
  },
  search: {
    matchBackground: "#FEF3C7",
    matchBorder: "#D97706",
    matchOverviewRuler: "#D97706",
    activeMatchBackground: "#FCD34D",
    activeMatchBorder: "#B45309",
    activeMatchColorOverviewRuler: "#B45309",
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
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', mode);
  }
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
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', mode);
  }
  listeners.forEach((fn) => fn());
}
