import { useSyncExternalStore } from "react";
import { getTheme, getThemeMode, subscribeTheme, type ThemeMode } from "../theme";

export function useTheme() {
  return useSyncExternalStore(subscribeTheme, getTheme, getTheme);
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
}
