import { convertFileSrc } from "@tauri-apps/api/core";
import type { InstalledIde } from "../types";

export const LOCAL_OPEN_WITH_ICON_DIRECTORY = "/open-with-icons";
const LOCAL_OPEN_WITH_ICON_EXTENSIONS = ["png", "webp", "jpeg", "jpg"] as const;

export const BROWSER_DESKTOP_ICON_URLS: Partial<Record<string, string>> = {
  cursor: "https://cursor.com/marketing-static/icon-512x512.png",
  zed: "https://zed.dev/_next/static/media/stable-app-logo.06nn-bqvtdgcl.png",
  warp: "https://www.warp.dev/android-chrome-512x512.png",
  terminal:
    "https://help.apple.com/assets/69DD569682238CF8EC0621E2/69DD569982238CF8EC0621E9/en_US/2250e17d87b2d16a5c14add24b5e3817.png",
  xcode:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4c/6d/8c/4c6d8c86-803d-e46c-d5a1-e41da9147ebc/Xcode-0-85-220-0-6-0-0-2x-P3-0-0.png/400x400bb.webp",
};

function getLocalOpenWithIconNameVariants(ideId: string): readonly string[] {
  return Array.from(new Set([ideId, ideId.split("-").join(" ")]));
}

export function getLocalOpenWithIconSources(ideId: string): readonly string[] {
  return getLocalOpenWithIconNameVariants(ideId).flatMap((name) =>
    LOCAL_OPEN_WITH_ICON_EXTENSIONS.map(
      (extension) => `${LOCAL_OPEN_WITH_ICON_DIRECTORY}/${name}.${extension}`,
    ),
  );
}

export function getOpenWithFallbackIconSrc(ide: InstalledIde): string | null {
  const browserIcon = BROWSER_DESKTOP_ICON_URLS[ide.id];
  if (browserIcon) {
    return browserIcon;
  }

  if (ide.iconPath) {
    return convertFileSrc(ide.iconPath);
  }

  return null;
}

export function getOpenWithIconSources(ide: InstalledIde): readonly string[] {
  const localIconSources = getLocalOpenWithIconSources(ide.id);
  const fallbackIconSource = getOpenWithFallbackIconSrc(ide);

  return fallbackIconSource
    ? [...localIconSources, fallbackIconSource]
    : localIconSources;
}

export function preloadOpenWithIcons(installedIdes: readonly InstalledIde[]): void {
  const iconSources = installedIdes
    .flatMap((ide) => getOpenWithIconSources(ide));

  iconSources.forEach((src) => {
    const image = new window.Image();
    image.src = src;
  });
}
