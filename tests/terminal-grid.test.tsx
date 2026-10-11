import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import React from "react";
import { Window } from "happy-dom";
import type { TerminalPane, WorktreeInfo } from "../src/types";

const browserWindow = new Window({ url: "http://localhost" });
Object.assign(globalThis, {
  window: browserWindow,
  document: browserWindow.document,
  navigator: browserWindow.navigator,
  HTMLElement: browserWindow.HTMLElement,
  Element: browserWindow.Element,
  Node: browserWindow.Node,
  Event: browserWindow.Event,
  getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IS_REACT_ACT_ENVIRONMENT: true,
});

// Fake backend: each PTY keeps producing output whether or not a view is attached.
const backend = new Map<string, { chunks: { data: string; sequence: number }[]; attached: boolean }>();
const pty = (id: string) => backend.get(id) ?? backend.set(id, { chunks: [], attached: false }).get(id)!;
const agentWrites = (id: string, data: string) => {
  const p = pty(id);
  p.chunks.push({ data, sequence: p.chunks.length + 1 });
};

class FakeXTerm {
  static alive = new Set<FakeXTerm>();
  screen = "";
  rows = 24;
  cols = 80;
  scrolledToBottom = false;
  parser = { registerOscHandler: () => ({ dispose() {} }), registerCsiHandler: () => ({ dispose() {} }) };
  constructor() { FakeXTerm.alive.add(this); }
  loadAddon(addon: { term?: FakeXTerm }) { addon.term = this; }
  open() {}
  onData() { return { dispose() {} }; }
  write(data: string, cb?: () => void) { this.screen += data; cb?.(); }
  refresh() {}
  scrollToBottom() { this.scrolledToBottom = true; }
  focus() {}
  dispose() { FakeXTerm.alive.delete(this); }
}
const screens = () => [...FakeXTerm.alive].map((t) => t.screen);

const theme = (await import("../src/theme")).getTheme();
const tauriCore = await import("@tauri-apps/api/core");
mock.module("../src/hooks/useTheme", () => ({ useTheme: () => theme }));
mock.module("../src/components/TerminalAnimation", () => ({ TerminalAnimation: () => null }));
mock.module("../src/components/BrowserPane", () => ({ BrowserPane: () => <div>Browser</div> }));
const listeners = new Map<string, Set<() => void>>();
const emitClosed = (id: string) => listeners.get(`terminal-closed-${id}`)?.forEach((fn) => fn());
mock.module("@tauri-apps/api/event", () => ({
  listen: async (event: string, fn: () => void) => {
    const set = listeners.get(event) ?? listeners.set(event, new Set()).get(event)!;
    set.add(fn);
    return () => set.delete(fn);
  },
}));
mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async (command: string, args: { terminalId: string; afterSequence?: number | null }) => {
    if (command === "attach_terminal_output") { pty(args.terminalId).attached = true; return 1; }
    if (command === "detach_terminal_output") { pty(args.terminalId).attached = false; return; }
    // Like the backend: the PTY dies and terminal-closed is emitted shortly after.
    if (command === "close_terminal") { setTimeout(() => emitClosed(args.terminalId), 0); return; }
    if (command === "get_terminal_output") {
      const chunks = pty(args.terminalId).chunks.filter((c) => c.sequence > (args.afterSequence ?? 0));
      return { data: chunks.map((c) => c.data).join(""), sequence: pty(args.terminalId).chunks.length, truncated: false };
    }
  },
}));
mock.module("@xterm/xterm", () => ({ Terminal: FakeXTerm }));
mock.module("@xterm/addon-fit", () => ({
  FitAddon: class { proposeDimensions() { return { cols: 80, rows: 24 }; } fit() {} },
}));
mock.module("@xterm/addon-search", () => ({ SearchAddon: class {} }));
mock.module("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
mock.module("@xterm/addon-serialize", () => ({
  SerializeAddon: class { term!: FakeXTerm; serialize() { return this.term.screen; } },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useAppStore } = await import("../src/store");
const { TerminalGrid } = await import("../src/components/TerminalGrid");

const worktree: WorktreeInfo = { name: "repo", path: "/repo", branch: "main", last_modified: null };
const tabs: TerminalPane[] = ["one", "two"].map((id) => ({
  id,
  terminals: [{ id: `terminal-${id}`, worktreePath: worktree.path, worktreeName: worktree.name }],
  activeTerminalId: `terminal-${id}`,
}));
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  backend.clear();
  FakeXTerm.alive.clear();
  useAppStore.setState({
    selectedWorktree: worktree,
    currentTerminalTabs: tabs,
    currentActiveTerminalTabId: tabs[0].id,
    currentTerminals: tabs[0].terminals,
    currentActiveTerminalId: tabs[0].activeTerminalId,
    terminalsByWorktree: { [worktree.path]: { tabs, activeTabId: tabs[0].id } },
  });
  agentWrites("terminal-one", "one-start|");
  agentWrites("terminal-two", "two-start|");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<TerminalGrid />));
  await settle();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test("only the active tab keeps a live terminal; hidden agents keep running and restore on return", async () => {
  expect(screens()).toEqual(["one-start|"]);
  expect(pty("terminal-one").attached).toBe(true);

  await act(async () => useAppStore.getState().setActiveTerminalTab("two"));
  await settle();
  expect(screens()).toEqual(["two-start|"]);
  expect(pty("terminal-one").attached).toBe(false);

  agentWrites("terminal-one", "agent-kept-working|");

  await act(async () => useAppStore.getState().setActiveTerminalTab("one"));
  await settle();
  const [restored] = FakeXTerm.alive;
  expect(FakeXTerm.alive.size).toBe(1);
  expect(restored.screen).toBe("one-start|agent-kept-working|");
  expect(restored.scrolledToBottom).toBe(true);
  expect(pty("terminal-one").attached).toBe(true);
  expect(pty("terminal-two").attached).toBe(false);
});

test("switching worktrees unmounts the previous worktree's terminals", async () => {
  const other = { ...worktree, path: "/other", name: "other" };
  const otherTab = { ...tabs[1], id: "other-tab", terminals: [{ ...tabs[1].terminals[0], id: "terminal-other" }], activeTerminalId: "terminal-other" };
  agentWrites("terminal-other", "other-start|");
  await act(async () => useAppStore.setState((state) => ({
    selectedWorktree: other,
    currentTerminalTabs: [otherTab], currentActiveTerminalTabId: otherTab.id,
    currentTerminals: otherTab.terminals, currentActiveTerminalId: otherTab.activeTerminalId,
    terminalsByWorktree: { ...state.terminalsByWorktree, [other.path]: { tabs: [otherTab], activeTabId: otherTab.id } },
  })));
  await settle();
  expect(screens()).toEqual(["other-start|"]);
  expect(pty("terminal-one").attached).toBe(false);
});

test("closing a hidden tab forgets its saved screen", async () => {
  await act(async () => useAppStore.getState().setActiveTerminalTab("two"));
  await settle();
  await act(async () => useAppStore.getState().closeTerminalTab("one"));
  await settle();

  // Reopen the same terminal id over a fresh backend: a leaked saved screen would be painted first.
  backend.delete("terminal-one");
  agentWrites("terminal-one", "fresh|");
  const reopened = { ...tabs[0] };
  await act(async () => useAppStore.setState({
    currentTerminalTabs: [reopened, tabs[1]], currentActiveTerminalTabId: reopened.id,
    currentTerminals: reopened.terminals, currentActiveTerminalId: reopened.activeTerminalId,
    terminalsByWorktree: { [worktree.path]: { tabs: [reopened, tabs[1]], activeTabId: reopened.id } },
  }));
  await settle();
  expect(screens()).toEqual(["fresh|"]);
});
