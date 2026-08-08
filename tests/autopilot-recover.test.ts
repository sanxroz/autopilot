import { describe, expect, test } from "bun:test";
import {
  addQueueDiagnostics,
  findRecoverableSessions,
  parseProcessSnapshot,
} from "../scripts/autopilot-recover.mjs";

const APP = "/Applications/Autopilot.app/Contents/MacOS/autopilot";

describe("autopilot recover", () => {
  test("lists only foreground processes owned by Autopilot terminal shells", () => {
    const records = parseProcessSnapshot(`
100 1 100 -1 S ?? ${APP}
110 100 110 120 Ss ttys007 /bin/zsh
120 110 120 120 S+ ttys007 bun /Users/test/.bun/bin/omp
130 100 130 130 Ss ttys008 /bin/zsh
140 999 140 140 S+ ttys009 codex
150 100 150 160 Z ttys010 <defunct>
999 1 999 -1 S ?? /bin/tool ${APP}
`);

    const sessions = findRecoverableSessions(records, (pid) => `/worktrees/${pid}`);

    expect(sessions).toEqual([
      {
        appPid: 100,
        shellPid: 110,
        tty: "ttys007",
        foregroundPid: 120,
        foregroundPgid: 120,
        processName: "omp",
        worktreePath: "/worktrees/110",
      },
    ]);
  });

  test("does not offer an idle shell as a recovery target", () => {
    const records = parseProcessSnapshot(`
100 1 100 -1 S ?? ${APP}
110 100 110 110 Ss ttys007 /bin/zsh
`);

    expect(findRecoverableSessions(records)).toEqual([]);
  });

  test("labels full queues and sorts likely blockers first", () => {
    const sessions = [
      { tty: "ttys001", worktreePath: "/worktrees/alpha", foregroundPid: 10 },
      { tty: "ttys002", worktreePath: "/worktrees/beta", foregroundPid: 20 },
    ];

    const diagnosed = addQueueDiagnostics(
      sessions,
      new Map([["ttys001", 12], ["ttys002", 1_022]]),
    );

    expect(diagnosed.map((session) => session.foregroundPid)).toEqual([20, 10]);
    expect(diagnosed[0].queuedInputBytes).toBe(1_022);
  });
});
