export const PANEL_RESIZE_END_EVENT = "app-panel-resize-end";

export function beginPanelResize(): void {
  document.documentElement.setAttribute("data-panel-resizing", "");
}

export function endPanelResize(): void {
  document.documentElement.removeAttribute("data-panel-resizing");
  window.dispatchEvent(new Event(PANEL_RESIZE_END_EVENT));
}

export function isPanelResizing(): boolean {
  return document.documentElement.hasAttribute("data-panel-resizing");
}
