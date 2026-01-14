import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TerminalGrid } from "./components/TerminalGrid";
import { useAppStore } from "./store";

function App() {
  const initialize = useAppStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div
      className="flex h-screen text-zinc-100 overflow-hidden rounded-lg"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
    >
      <div
        data-tauri-drag-region
        className="absolute top-0 left-0 right-0 h-12 z-50"
      />
      <Sidebar />
      <TerminalGrid />
    </div>
  );
}

export default App;
