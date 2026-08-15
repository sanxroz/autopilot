import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { link, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const STORE_FILENAME = "autopilot-settings.json";
const EMPTY_LOCK_STALE_MS = 5000;

export function getSettingsPath() {
  const home = os.homedir();

  if (process.env.AUTOPILOT_SETTINGS_PATH) {
    return process.env.AUTOPILOT_SETTINGS_PATH;
  }

  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "com.autopilot.app", STORE_FILENAME);
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "com.autopilot.app", STORE_FILENAME);
    default:
      return path.join(home, ".local", "share", "com.autopilot.app", STORE_FILENAME);
  }
}

export function normalizeWorktreePath(worktreePath) {
  return path.resolve(worktreePath);
}

export function detectCurrentWorktreePath() {
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const resolved = output.trim();
    return resolved || process.cwd();
  } catch {
    return process.cwd();
  }
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createLock(lockPath) {
  const candidatePath = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(candidatePath, `${process.pid}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await link(candidatePath, lockPath);
    return await open(lockPath, "r");
  } finally {
    await unlink(candidatePath).catch(() => undefined);
  }
}

export async function readSettingsFile(settingsPath) {
  try {
    const raw = await readFile(settingsPath, "utf8");
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${settingsPath}`);
    }

    throw error;
  }
}

export async function acquireLock(lockPath) {
  await mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    try {
      return await createLock(lockPath);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }

      try {
        const lockContents = await readFile(lockPath, "utf8");
        if (!lockContents.trim()) {
          const lockStat = await stat(lockPath);
          if (Date.now() - lockStat.mtimeMs >= EMPTY_LOCK_STALE_MS) {
            throw new Error(`Stale empty Autopilot settings lock at ${lockPath}. Remove it after confirming no Autopilot CLI process is running.`);
          }
          await sleep(50);
          continue;
        }
        const lockPid = Number(lockContents.trim());
        if (!Number.isInteger(lockPid) || lockPid <= 0) {
          throw new Error(`Invalid Autopilot settings lock at ${lockPath}. Remove it after confirming no Autopilot CLI process is running.`);
        }

        try {
          process.kill(lockPid, 0);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ESRCH") {
            throw new Error(`Stale Autopilot settings lock for PID ${lockPid} at ${lockPath}. Remove it after confirming that process is no longer running.`);
          }
        }
      } catch (lockError) {
        if (lockError instanceof Error && "code" in lockError && lockError.code === "ENOENT") {
          continue;
        }
        throw lockError;
      }

      await sleep(50);
    }
  }
}

export async function releaseLock(lockHandle, lockPath) {
  await lockHandle.close();
  await unlink(lockPath).catch((error) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  });
}

export async function writeSettingsFile(settingsPath, data) {
  const directory = path.dirname(settingsPath);
  const tempPath = path.join(directory, `${path.basename(settingsPath)}.${process.pid}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);
}
