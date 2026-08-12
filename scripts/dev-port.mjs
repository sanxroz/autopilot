import net from "node:net";

const DEFAULT_DEV_PORT = 1420;
const WORKTREE_PORT_SLOTS = 200;

function hashSeed(seed) {
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function getWorktreeName(cwd) {
  const normalized = cwd.replace(/\\/g, "/");
  const marker = "/.worktrees/";
  const markerIndex = normalized.lastIndexOf(marker);

  if (markerIndex === -1) {
    return "default";
  }

  const worktreePath = normalized.slice(markerIndex + marker.length);
  const [worktreeName] = worktreePath.split("/");

  return worktreeName || "default";
}

function getPreferredPortConfig(cwd) {
  const explicitDevPort = process.env.AUTOPILOT_DEV_PORT;
  const explicitHmrPort = process.env.AUTOPILOT_HMR_PORT;

  if (explicitDevPort) {
    const devPort = Number(explicitDevPort);
    const hmrPort = explicitHmrPort ? Number(explicitHmrPort) : devPort + 1;

    return { devPort, hmrPort };
  }

  const worktreeName = getWorktreeName(cwd);

  if (worktreeName === "default") {
    return { devPort: DEFAULT_DEV_PORT, hmrPort: DEFAULT_DEV_PORT + 1 };
  }

  const slot = (hashSeed(worktreeName) % (WORKTREE_PORT_SLOTS - 1)) + 1;
  const devPort = DEFAULT_DEV_PORT + slot * 2;

  return { devPort, hmrPort: devPort + 1 };
}

function canListenOnHost(port, host, ignoreUnavailableAddress = false) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      resolve(ignoreUnavailableAddress && error.code === "EADDRNOTAVAIL");
    });

    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function canListen(port, host) {
  if (host !== "localhost") {
    return canListenOnHost(port, host);
  }

  const results = await Promise.all(
    ["127.0.0.1", "::1"].map((candidate) =>
      canListenOnHost(port, candidate, true),
    ),
  );
  return results.every(Boolean);
}

export async function getAvailablePortConfig(cwd, host = "localhost") {
  const preferred = getPreferredPortConfig(cwd);

  for (let offset = 0; offset < WORKTREE_PORT_SLOTS; offset += 1) {
    const devPort = preferred.devPort + offset * 2;
    const hmrPort = devPort + 1;
    const devAvailable = await canListen(devPort, host);

    if (!devAvailable) {
      continue;
    }

    const hmrAvailable = await canListen(hmrPort, host);

    if (hmrAvailable) {
      return { devPort, hmrPort };
    }
  }

  throw new Error("Unable to find an available Vite/Tauri port pair.");
}

export { getPreferredPortConfig };
