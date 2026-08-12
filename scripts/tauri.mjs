import { spawn } from "node:child_process";
import { getAvailablePortConfig } from "./dev-port.mjs";
import { configureSharedCargoTarget } from "./shared-build-cache.mjs";

const [command, ...restArgs] = process.argv.slice(2);

if (!command) {
  process.exit(0);
}

const childEnv = { ...process.env };

configureSharedCargoTarget(childEnv);
let tauriArgs = [command, ...restArgs];
const developmentConfig = {
  productName: "Autopilot Development",
  identifier: "com.autopilot.development",
  bundle: {
    createUpdaterArtifacts: false,
    icon: [
      "icons-development/32x32.png",
      "icons-development/128x128.png",
      "icons-development/128x128@2x.png",
      "icons-development/icon.icns",
      "icons-development/icon.ico",
    ],
  },
  app: {
    windows: [
      {
        title: "Autopilot Development",
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        decorations: true,
        transparent: true,
        titleBarStyle: "Overlay",
        hiddenTitle: true,
        backgroundColor: "#00000000",
      },
    ],
  },
};

if (command === "dev" || command === "build" || command === "bundle") {
  childEnv.VITE_AUTOPILOT_DEVELOPMENT = "1";
  tauriArgs = [
    command,
    "--config",
    JSON.stringify(developmentConfig),
    ...restArgs,
  ];
}

if (command === "dev") {
  const devHost = childEnv.TAURI_DEV_HOST || "localhost";

  try {
    const { devPort, hmrPort } = await getAvailablePortConfig(
      process.cwd(),
      devHost,
    );

    childEnv.AUTOPILOT_DEV_PORT = String(devPort);
    childEnv.AUTOPILOT_HMR_PORT = String(hmrPort);

    tauriArgs = [
      "dev",
      "--config",
      JSON.stringify({
        ...developmentConfig,
        build: {
          devUrl: `http://localhost:${devPort}`,
        },
      }),
      ...restArgs,
    ];
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        `Unable to find an available port pair for Tauri dev on ${devHost}. Try closing other dev servers or set AUTOPILOT_DEV_PORT manually.`,
      );
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}

const child = spawn("bunx", ["tauri", ...tauriArgs], {
  cwd: process.cwd(),
  env: childEnv,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
