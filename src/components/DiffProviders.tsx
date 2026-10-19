import type { ReactNode } from "react";
import {
  EditProvider,
  WorkerPoolContextProvider,
  type CreateEditor,
} from "@pierre/diffs/react";
import { Editor } from "@pierre/diffs/edit";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";

const createDiffEditor: CreateEditor<undefined> = (options) =>
  new Editor(options);

const poolOptions = {
  workerFactory: () => new DiffsWorker(),
  poolSize: 1,
  totalASTLRUCacheSize: 20,
};

export function DiffProviders({ children }: { children: ReactNode }) {
  return (
    <EditProvider createEditor={createDiffEditor}>
      <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={{}}>
        {children}
      </WorkerPoolContextProvider>
    </EditProvider>
  );
}
