import { spawn } from "node:child_process";
import { getAvailablePortConfig } from "./dev-port.mjs";

const [command, ...restArgs] = process.argv.slice(2);

if (!command) {
  process.exit(0);
}

const childEnv = { ...process.env };
let tauriArgs = [command, ...restArgs];

if (command === "dev") {
  const { devPort, hmrPort } = await getAvailablePortConfig(process.cwd());

  childEnv.AUTOPILOT_DEV_PORT = String(devPort);
  childEnv.AUTOPILOT_HMR_PORT = String(hmrPort);

  tauriArgs = [
    "dev",
    "--config",
    JSON.stringify({
      build: {
        devUrl: `http://localhost:${devPort}`,
      },
    }),
    ...restArgs,
  ];
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
