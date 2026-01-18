import { X, Check, AlertCircle, Terminal } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { useAppStore } from "../store";
import { POLLING_INTERVALS } from "../types/github";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const theme = useTheme();
  const { githubSettings, setPollingInterval } = useAppStore();

  const currentInterval = githubSettings.pollingIntervalMs;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg shadow-xl"
        style={{ background: theme.bg.secondary }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: theme.border.default }}
        >
          <h2 className="font-semibold" style={{ color: theme.text.primary }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: theme.text.tertiary }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          <div>
            <h3
              className="text-sm font-medium mb-3"
              style={{ color: theme.text.primary }}
            >
              GitHub Integration
            </h3>

            <div className="space-y-4">
              <div
                className="p-3 rounded-lg border"
                style={{
                  background: theme.bg.primary,
                  borderColor: theme.border.default,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-md"
                    style={{ background: theme.bg.tertiary }}
                  >
                    <Terminal className="w-4 h-4" style={{ color: theme.text.secondary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: theme.text.primary }}>
                        GitHub CLI
                      </span>
                      {githubSettings.ghCliAvailable ? (
                        <Check className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5" style={{ color: "#EF4444" }} />
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: theme.text.tertiary }}>
                      {githubSettings.ghCliAvailable
                        ? githubSettings.ghAuthUser
                          ? `Authenticated as @${githubSettings.ghAuthUser}`
                          : "Installed but not authenticated"
                        : "Not installed - run: brew install gh"}
                    </p>
                  </div>
                </div>
              </div>

              {!githubSettings.ghCliAvailable && (
                <p className="text-xs" style={{ color: theme.text.tertiary }}>
                  Install the GitHub CLI to enable PR status tracking.{" "}
                  <a
                    href="https://cli.github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: theme.accent.primary }}
                  >
                    Learn more
                  </a>
                </p>
              )}

              <div>
                <label
                  className="block text-xs mb-2"
                  style={{ color: theme.text.secondary }}
                >
                  Polling Interval
                </label>
                <div className="flex gap-2">
                  {Object.entries(POLLING_INTERVALS).map(([key, value]) => (
                    <button
                      key={key}
                      onClick={() => setPollingInterval(value)}
                      className="flex-1 px-3 py-2 text-xs rounded border transition-colors"
                      style={{
                        background: currentInterval === value ? theme.accent.primary : theme.bg.primary,
                        borderColor: currentInterval === value ? theme.accent.primary : theme.border.default,
                        color: currentInterval === value ? "#fff" : theme.text.secondary,
                      }}
                    >
                      {value / 1000}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex justify-end px-4 py-3 border-t"
          style={{ borderColor: theme.border.default }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded transition-colors"
            style={{
              background: theme.accent.primary,
              color: "#fff",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
