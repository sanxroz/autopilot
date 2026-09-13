import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import React from "react";
import { Window } from "happy-dom";

const browserWindow = new Window({ url: "http://localhost" });
Object.assign(globalThis, {
  window: browserWindow,
  document: browserWindow.document,
  navigator: browserWindow.navigator,
  HTMLElement: browserWindow.HTMLElement,
  Element: browserWindow.Element,
  Node: browserWindow.Node,
  Event: browserWindow.Event,
  MouseEvent: browserWindow.MouseEvent,
  getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
  requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
  cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  IS_REACT_ACT_ENVIRONMENT: true,
});

type LinkHandler = (event: MouseEvent, uri: string) => void;
type OutputListener = (event: { payload: { data: string; sequence: number } }) => void;

let activateLink: LinkHandler;
let outputListener: OutputListener;
const openBrowserTab = mock(() => {});
const openUrl = mock(async () => {});
const write = mock((_data: string, callback?: () => void) => callback?.());

const theme = (await import("../src/theme")).getTheme();
const tauriCore = await import("@tauri-apps/api/core");
mock.module("../src/hooks/useTheme", () => ({ useTheme: () => theme }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl }));
mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async (command: string) => {
    if (command === "attach_terminal_output") return 1;
    if (command === "get_terminal_output") return { data: "", sequence: 0 };
  },
}));
mock.module("@tauri-apps/api/event", () => ({
  listen: async (event: string, listener: OutputListener) => {
    if (event.startsWith("terminal-output-")) outputListener = listener;
    return () => {};
  },
}));
mock.module("@xterm/addon-fit", () => ({
  FitAddon: class {
    proposeDimensions() { return { cols: 80, rows: 24 }; }
    fit() {}
  },
}));
mock.module("@xterm/addon-search", () => ({ SearchAddon: class {} }));
mock.module("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
mock.module("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    options: Record<string, unknown>;
    parser = { registerOscHandler: () => ({ dispose() {} }) };
    constructor(options: { linkHandler: { activate: LinkHandler } }) {
      this.options = options;
      activateLink = options.linkHandler.activate;
    }
    loadAddon() {}
    open() {}
    onData() { return { dispose() {} }; }
    write = write;
    refresh() {}
    scrollToBottom() {}
    focus() {}
    dispose() {}
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useAppStore } = await import("../src/store");
const { Terminal } = await import("../src/components/Terminal");
const originalOpenBrowserTab = useAppStore.getState().openBrowserTab;
useAppStore.setState({ openBrowserTab });

describe("terminal links", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    openBrowserTab.mockClear();
    openUrl.mockClear();
    write.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Terminal terminalId="terminal-1" isActive={false} onFocus={() => {}} />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  afterAll(() => useAppStore.setState({ openBrowserTab: originalOpenBrowserTab }));

  test("output stays in the terminal while clicked links use the correct route", async () => {
    await act(async () => {
      outputListener({ payload: { data: "http://localhost:5173/", sequence: 1 } });
    });
    expect(write).toHaveBeenCalledWith("http://localhost:5173/", expect.any(Function));
    expect(openBrowserTab).not.toHaveBeenCalled();

    activateLink(new MouseEvent("click"), "http://localhost:5173/");
    activateLink(new MouseEvent("click"), "https://example.com/");

    expect(openBrowserTab).toHaveBeenCalledWith("http://localhost:5173/");
    expect(openUrl).toHaveBeenCalledWith("https://example.com/");
  });
});
