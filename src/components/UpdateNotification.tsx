import { Download, RefreshCw, AlertCircle, Sparkles, Clock, ArrowRight } from "lucide-react";
import * as Modal from "./ui/modal";

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
  if (status === "idle" || !updateInfo) return null;

  const renderContent = () => {
    switch (status) {
      case "available":
        return (
          <>
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-tertiary border border-border">
                <Sparkles className="w-6 h-6 text-accent-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <Modal.Title className="text-base font-semibold mb-1">
                  Update Available
                </Modal.Title>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent-primary/20 text-accent-primary border border-accent-primary/30">
                    v{updateInfo.version}
                  </span>
                  {updateInfo.date && (
                    <span className="flex items-center gap-1 text-xs text-tertiary">
                      <Clock className="w-3.5 h-3.5" />
                      {updateInfo.date}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {updateInfo.body && (
              <div className="mb-5 rounded-lg p-4 bg-tertiary border border-border-subtle">
                <div className="flex items-center gap-2 mb-2 text-secondary">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium uppercase tracking-wider">
                    What's New
                  </span>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto pr-2 text-secondary">
                  {updateInfo.body}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onLater}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 bg-transparent text-secondary border border-border hover:bg-hover hover:border-border-strong"
              >
                Later
              </button>
              <button
                onClick={onUpdate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 bg-accent-primary text-primary hover:bg-accent-hover hover:-translate-y-px"
              >
                <Download className="w-3.5 h-3.5" />
                Update Now
              </button>
            </div>
          </>
        );

      case "downloading":
        return (
          <>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-tertiary border border-border">
                <Download className="w-6 h-6 animate-pulse text-accent-primary" />
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
              <div className="relative h-2 rounded-full overflow-hidden bg-tertiary">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-150 ease-out bg-accent-primary"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-tertiary">
                  Downloading v{updateInfo.version}
                </span>
                <span className="text-sm font-semibold tabular-nums text-accent-primary">
                  {Math.round(downloadProgress)}%
                </span>
              </div>
            </div>

          </>
        );

      case "ready":
        return (
          <>
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-semantic-success-muted border border-semantic-success">
                <RefreshCw className="w-6 h-6 text-semantic-success" />
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

            <div className="mb-5 rounded-lg p-4 bg-tertiary border border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-semantic-success" />
                <span className="text-sm text-secondary">
                  Version <strong className="text-primary">{updateInfo.version}</strong> is ready
                </span>
              </div>
            </div>

            <button
              onClick={onRestart}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 bg-semantic-success text-white hover:opacity-90 hover:-translate-y-px"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restart Now
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        );

      case "error":
        return (
          <>
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-semantic-error-muted border border-semantic-error">
                <AlertCircle className="w-6 h-6 text-semantic-error" />
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
              <div className="mb-5 rounded-lg p-4 bg-semantic-error-muted border border-semantic-error/30">
                <div className="flex items-start gap-2 text-semantic-error">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed break-words">{error}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onLater}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 bg-transparent text-secondary border border-border hover:bg-hover hover:border-border-strong"
              >
                Cancel
              </button>
              <button
                onClick={onRetry}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 bg-accent-primary text-primary hover:bg-accent-hover hover:-translate-y-px"
              >
                <RefreshCw className="w-3.5 h-3.5" />
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
