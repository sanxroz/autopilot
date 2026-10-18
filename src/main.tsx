import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeTheme } from "./theme";
import { Provider as TooltipProvider } from "./components/ui/tooltip";

initializeTheme("dark");
document.title = import.meta.env.VITE_AUTOPILOT_DEVELOPMENT === "1"
  ? "Autopilot Development"
  : "Autopilot";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={350} skipDelayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
