import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { preloadDiffHighlighter } from "./lib/diff-highlighter";
import { initializeTheme } from "./theme";

preloadDiffHighlighter();
initializeTheme("dark");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
