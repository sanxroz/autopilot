import { useState, useEffect, useCallback } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "available" | "downloading" | "ready" | "error";

export interface UpdateInfo {
  version: string;
  body?: string;
  date?: string;
}

export interface UseUpdaterReturn {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  error: string | undefined;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restart: () => Promise<void>;
  dismissUpdate: () => void;
}

export function useUpdater(): UseUpdaterReturn {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    try {
      setError(undefined);
      const update = await check();
      
      if (update) {
        setUpdateInfo({
          version: update.version,
          body: update.body ?? undefined,
          date: update.date ? new Date(update.date).toLocaleDateString() : undefined,
        });
        setPendingUpdate(update);
        setStatus("available");
      }
    } catch (err) {
      console.error("Failed to check for updates:", err);
      // Don't show error for check failures - just log silently
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!pendingUpdate) return;

    try {
      setStatus("downloading");
      setDownloadProgress(0);
      setError(undefined);

      let totalLength = 0;
      let downloaded = 0;

      await pendingUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (totalLength > 0) {
              setDownloadProgress((downloaded / totalLength) * 100);
            }
            break;
          case "Finished":
            setDownloadProgress(100);
            break;
        }
      });

      setStatus("ready");
    } catch (err) {
      console.error("Failed to download update:", err);
      setError(err instanceof Error ? err.message : "Failed to download update");
      setStatus("error");
    }
  }, [pendingUpdate]);

  const restart = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to restart:", err);
      setError(err instanceof Error ? err.message : "Failed to restart application");
      setStatus("error");
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setStatus("idle");
    setUpdateInfo(null);
    setPendingUpdate(null);
    setDownloadProgress(0);
    setError(undefined);
  }, []);

  // Check for updates on mount (with a small delay to not block startup)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 3000); // Check 3 seconds after app starts

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  return {
    status,
    updateInfo,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
    restart,
    dismissUpdate,
  };
}
