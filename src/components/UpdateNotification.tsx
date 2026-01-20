import { Download, RefreshCw, AlertCircle, Sparkles, Clock, ArrowRight } from "lucide-react";
import * as Modal from "./ui/modal";
import { useTheme } from "../hooks/useTheme";

interface UpdateNotificationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: {
    version: string;
    body?: string;
    date?: string;
  } | null;
  downloadProgress: number;
  status: "idle" | "available" | "downloading" | "ready" | "error";
  error?: string;
  onUpdate: () => void;
  onLater: () => void;
  onRestart: () => void;
  onRetry: () => void;
}

export function UpdateNotification({
  open,
  onOpenChange,
  updateInfo,
  downloadProgress,
  status,
  error,
  onUpdate,
  onLater,
  onRestart,
  onRetry,
}: UpdateNotificationProps) {
  const theme = useTheme();

  if (status === "idle" || !updateInfo) return null;

  const renderContent = () => {
    switch (status) {
      case "available":
        return (
          <>
            <div className="flex items-start gap-4 mb-5">
              <div
                className="relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent.primary}20, ${theme.accent.secondary}30)`,
                  border: `1px solid ${theme.accent.primary}40`,
                }}
              >
                <Sparkles
                  className="w-6 h-6"
                  style={{ color: theme.accent.primary }}
                />
                <div
                  className="absolute inset-0 rounded-xl blur-lg opacity-30"
                  style={{ background: theme.accent.primary }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <Modal.Title className="text-base font-semibold mb-1">
                  Update Available
                </Modal.Title>
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{
                      background: `${theme.accent.primary}20`,
                      color: theme.accent.primary,
                      border: `1px solid ${theme.accent.primary}30`,
                    }}
                  >
                    v{updateInfo.version}
                  </span>
                  {updateInfo.date && (
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: theme.text.tertiary }}
                    >
                      <Clock className="w-3 h-3" />
                      {updateInfo.date}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {updateInfo.body && (
              <div
                className="mb-5 rounded-lg p-4"
                style={{
                  background: theme.bg.tertiary,
                  border: `1px solid ${theme.border.subtle}`,
                }}
              >
                <div
                  className="flex items-center gap-2 mb-2"
                  style={{ color: theme.text.secondary }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium uppercase tracking-wider">
                    What's New
                  </span>
                </div>
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto pr-2"
                  style={{
                    color: theme.text.secondary,
                  }}
                >
                  {updateInfo.body}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onLater}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200"
                style={{
                  background: "transparent",
                  color: theme.text.secondary,
                  border: `1px solid ${theme.border.default}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.bg.hover;
                  e.currentTarget.style.borderColor = theme.border.strong;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = theme.border.default;
                }}
              >
                Later
              </button>
              <button
                onClick={onUpdate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200"
                style={{
                  background: theme.accent.primary,
                  color: theme.bg.primary,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.accent.hover;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = theme.accent.primary;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <Download className="w-4 h-4" />
                Update Now
              </button>
            </div>
          </>
        );

      case "downloading":
        return (
          <>
            <div className="flex items-center gap-4 mb-5">
              <div
                className="relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent.primary}20, ${theme.accent.secondary}30)`,
                  border: `1px solid ${theme.accent.primary}40`,
                }}
              >
                <Download
                  className="w-6 h-6 animate-pulse"
                  style={{ color: theme.accent.primary }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <Modal.Title className="text-base font-semibold mb-1">
                  Downloading Update
                </Modal.Title>
                <Modal.Description>
                  Please wait while the update downloads...
                </Modal.Description>
              </div>
            </div>

            <div className="space-y-3">
              <div
                className="relative h-2 rounded-full overflow-hidden"
                style={{ background: theme.bg.tertiary }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${downloadProgress}%`,
                    background: `linear-gradient(90deg, ${theme.accent.secondary}, ${theme.accent.primary})`,
                    boxShadow: `0 0 12px ${theme.accent.primary}60`,
                  }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${downloadProgress}%`,
                    background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)`,
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: theme.text.tertiary }}>
                  Downloading v{updateInfo.version}
                </span>
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: theme.accent.primary }}
                >
                  {Math.round(downloadProgress)}%
                </span>
              </div>
            </div>

            <style>{`
              @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(200%); }
              }
            `}</style>
          </>
        );

      case "ready":
        return (
          <>
            <div className="flex items-start gap-4 mb-5">
              <div
                className="relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.semantic.success}20, ${theme.semantic.success}30)`,
                  border: `1px solid ${theme.semantic.success}40`,
                }}
              >
                <RefreshCw
                  className="w-6 h-6"
                  style={{ color: theme.semantic.success }}
                />
                <div
                  className="absolute inset-0 rounded-xl blur-lg opacity-30"
                  style={{ background: theme.semantic.success }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <Modal.Title className="text-base font-semibold mb-1">
                  Ready to Install
                </Modal.Title>
                <Modal.Description>
                  The update has been downloaded. Restart to apply changes.
                </Modal.Description>
              </div>
            </div>

            <div
              className="mb-5 rounded-lg p-4"
              style={{
                background: theme.bg.tertiary,
                border: `1px solid ${theme.border.subtle}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: theme.semantic.success }}
                />
                <span className="text-sm" style={{ color: theme.text.secondary }}>
                  Version <strong style={{ color: theme.text.primary }}>{updateInfo.version}</strong> is ready
                </span>
              </div>
            </div>

            <button
              onClick={onRestart}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200"
              style={{
                background: theme.semantic.success,
                color: "#fff",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Restart Now
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        );

      case "error":
        return (
          <>
            <div className="flex items-start gap-4 mb-5">
              <div
                className="relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.semantic.error}20, ${theme.semantic.error}30)`,
                  border: `1px solid ${theme.semantic.error}40`,
                }}
              >
                <AlertCircle
                  className="w-6 h-6"
                  style={{ color: theme.semantic.error }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <Modal.Title className="text-base font-semibold mb-1">
                  Update Failed
                </Modal.Title>
                <Modal.Description>
                  Something went wrong while updating.
                </Modal.Description>
              </div>
            </div>

            {error && (
              <div
                className="mb-5 rounded-lg p-4"
                style={{
                  background: theme.semantic.errorMuted,
                  border: `1px solid ${theme.semantic.error}30`,
                }}
              >
                <div
                  className="flex items-start gap-2"
                  style={{ color: theme.semantic.error }}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed break-words">{error}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onLater}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200"
                style={{
                  background: "transparent",
                  color: theme.text.secondary,
                  border: `1px solid ${theme.border.default}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.bg.hover;
                  e.currentTarget.style.borderColor = theme.border.strong;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = theme.border.default;
                }}
              >
                Cancel
              </button>
              <button
                onClick={onRetry}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200"
                style={{
                  background: theme.accent.primary,
                  color: theme.bg.primary,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.accent.hover;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = theme.accent.primary;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content
        className="max-w-[420px]"
        showClose={status !== "downloading"}
        style={{
          padding: "24px",
        }}
      >
        {renderContent()}
      </Modal.Content>
    </Modal.Root>
  );
}
