import type { DocModel } from "../schema/docmodel";
import { serializeDocModel } from "../docmodel/serialize";

export interface AutosaveOptions {
  debounceMs: number;
  writeJson: (json: string) => Promise<void> | void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface AutosaveController {
  schedule(doc: DocModel): void;
  flush(): Promise<void>;
  cancel(): void;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

export function createAutosaveController(options: AutosaveOptions): AutosaveController {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let timer: TimeoutHandle | undefined;
  let pendingDoc: DocModel | undefined;

  async function savePending(): Promise<void> {
    if (pendingDoc === undefined) {
      return;
    }
    const doc = pendingDoc;
    pendingDoc = undefined;
    await options.writeJson(serializeDocModel(doc));
  }

  return {
    schedule(doc: DocModel): void {
      pendingDoc = doc;
      if (timer !== undefined) {
        clearTimeoutFn(timer);
      }
      timer = setTimeoutFn(() => {
        timer = undefined;
        void savePending();
      }, options.debounceMs);
    },

    async flush(): Promise<void> {
      if (timer !== undefined) {
        clearTimeoutFn(timer);
        timer = undefined;
      }
      await savePending();
    },

    cancel(): void {
      if (timer !== undefined) {
        clearTimeoutFn(timer);
        timer = undefined;
      }
      pendingDoc = undefined;
    },
  };
}
