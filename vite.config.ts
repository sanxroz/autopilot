import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { getPreferredPortConfig } from "./scripts/dev-port.mjs";

const processRef = (
  globalThis as typeof globalThis & {
    process?: {
      cwd?: () => string;
      env?: Record<string, string | undefined>;
    };
  }
).process;
const env = processRef?.env ?? {};
const host = env.TAURI_DEV_HOST;
const explicitDevPort = env.AUTOPILOT_DEV_PORT;
const explicitHmrPort = env.AUTOPILOT_HMR_PORT;

function getPortConfig() {
  if (explicitDevPort) {
    const devPort = Number(explicitDevPort);
    const hmrPort = explicitHmrPort ? Number(explicitHmrPort) : devPort + 1;

    return { devPort, hmrPort };
  }

  const cwd = processRef?.cwd?.() ?? "";

  return getPreferredPortConfig(cwd);
}

const { devPort, hmrPort } = getPortConfig();

export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  server: {
    port: devPort,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: hmrPort,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}))
