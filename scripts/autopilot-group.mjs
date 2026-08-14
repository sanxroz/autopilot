import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  acquireLock,
  detectCurrentWorktreePath,
  getSettingsPath,
  isRecord,
  normalizeWorktreePath,
  readSettingsFile,
  releaseLock,
  writeSettingsFile,
} from "./autopilot-note.mjs";

const GROUPS_KEY = "sidebarGroupsByRepo";

function gitOutput(worktreePath, args) {
  return execFileSync("git", ["-C", worktreePath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function getWorktreeContext(worktreePath) {
  const requestedPath = normalizeWorktreePath(worktreePath);
  const resolvedWorktreePath = normalizeWorktreePath(
    gitOutput(requestedPath, ["rev-parse", "--show-toplevel"]),
  );
  const commonDirectory = normalizeWorktreePath(
    gitOutput(resolvedWorktreePath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  );

  return {
    repoPath: path.dirname(commonDirectory),
    worktreePath: resolvedWorktreePath,
  };
}

function validGroups(value) {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (group) =>
      isRecord(group) &&
      typeof group.id === "string" &&
      typeof group.name === "string" &&
      Array.isArray(group.worktreePaths) &&
      group.worktreePaths.every((worktreePath) => typeof worktreePath === "string"),
  );
}

export function setGroup(groups, worktreePath, name, createId = randomUUID) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Group name cannot be empty.");

  const currentGroups = validGroups(groups);
  const matchingGroups = currentGroups.filter((group) => group.name === normalizedName);
  const mergedWorktreePaths = [
    ...new Set([
      ...matchingGroups.flatMap((group) => group.worktreePaths),
      worktreePath,
    ]),
  ];
  const nextGroups = currentGroups
    .filter((group) => group.name !== normalizedName)
    .map((group) => ({
      ...group,
      worktreePaths: group.worktreePaths.filter((path) => path !== worktreePath),
    }))
    .filter((group) => group.worktreePaths.length > 0);

  if (matchingGroups.length === 0) {
    nextGroups.push({
      id: createId(),
      name: normalizedName,
      worktreePaths: mergedWorktreePaths,
    });
  } else {
    const firstMatchIndex = currentGroups.findIndex((group) => group.name === normalizedName);
    const insertionIndex = currentGroups
      .slice(0, firstMatchIndex)
      .filter((group) => group.name !== normalizedName && group.worktreePaths.some((path) => path !== worktreePath))
      .length;
    nextGroups.splice(insertionIndex, 0, {
      ...matchingGroups[0],
      worktreePaths: mergedWorktreePaths,
    });
  }

  return nextGroups;
}

export function clearGroup(groups, worktreePath) {
  return validGroups(groups)
    .map((group) => ({
      ...group,
      worktreePaths: group.worktreePaths.filter((path) => path !== worktreePath),
    }))
    .filter((group) => group.worktreePaths.length > 0);
}

export function getGroupName(groups, worktreePath) {
  return validGroups(groups).find((group) => group.worktreePaths.includes(worktreePath))?.name ?? "";
}

function parseArgs(argv) {
  const [command = "", ...rest] = argv;
  if (command === "--help" || command === "-h" || command === "help") {
    return { command: "help", name: "", worktreePath: "" };
  }
  let name = "";
  let worktreePath = "";

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--worktree" || argument === "-w") {
      worktreePath = rest[++index] ?? "";
      if (!worktreePath) throw new Error(`${argument} requires a path.`);
    } else if (argument === "--help" || argument === "-h") {
      return { command: "help", name: "", worktreePath: "" };
    } else if (!name) {
      name = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  return { command, name, worktreePath };
}

function printUsage() {
  console.log(`Usage:
  autopilot group set <name> [--worktree <path>]
  autopilot group get [--worktree <path>]
  autopilot group clear [--worktree <path>]`);
}

async function main() {
  const { command, name, worktreePath } = parseArgs(process.argv.slice(2));
  if (!command || command === "help") {
    printUsage();
    return;
  }
  if (!new Set(["set", "get", "clear"]).has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  if (command === "set" && !name.trim()) {
    throw new Error("Usage: autopilot group set <name> [--worktree <path>]");
  }
  if (command !== "set" && name) {
    throw new Error(`Unexpected argument: ${name}`);
  }

  const context = getWorktreeContext(worktreePath || detectCurrentWorktreePath());
  if (command === "set" && context.worktreePath === context.repoPath) {
    throw new Error("The main worktree is not an Autopilot sidebar session. Run this command from a linked worktree.");
  }
  const settingsPath = getSettingsPath();
  const lockPath = `${settingsPath}.lock`;
  const lockHandle = await acquireLock(lockPath);

  try {
    const settings = await readSettingsFile(settingsPath);
    const groupsByRepo = isRecord(settings[GROUPS_KEY]) ? { ...settings[GROUPS_KEY] } : {};
    const groups = groupsByRepo[context.repoPath];

    if (command === "get") {
      process.stdout.write(getGroupName(groups, context.worktreePath));
      return;
    }

    groupsByRepo[context.repoPath] = command === "set"
      ? setGroup(groups, context.worktreePath, name)
      : clearGroup(groups, context.worktreePath);
    settings[GROUPS_KEY] = groupsByRepo;
    await writeSettingsFile(settingsPath, settings);
  } finally {
    await releaseLock(lockHandle, lockPath);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
