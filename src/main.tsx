import React from "react";
import ReactDOM from "react-dom/client";
import {
  EditProvider,
  WorkerPoolContextProvider,
  type CreateEditor,
} from "@pierre/diffs/react";
import { Editor } from "@pierre/diffs/edit";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import App from "./App";
import "./index.css";
import { preloadDiffHighlighter } from "./lib/diff-highlighter";
import { initializeTheme } from "./theme";

preloadDiffHighlighter();
initializeTheme("dark");

const createDiffEditor: CreateEditor<undefined> = (options) =>
  new Editor(options);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <EditProvider createEditor={createDiffEditor}>
      <WorkerPoolContextProvider
        poolOptions={{
          workerFactory: () => new DiffsWorker(),
          poolSize: 1,
          totalASTLRUCacheSize: 20,
        }}
        highlighterOptions={{}}
      >
        <App />
      </WorkerPoolContextProvider>
    </EditProvider>
  </React.StrictMode>,
);
