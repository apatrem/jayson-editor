import { invoke } from "@tauri-apps/api/core";
import { isIpcError } from "../../ipc/errors";
import { classifyAppConfig } from "../../config/classify";
import type { Route } from "./types";

export interface BootStrategy {
  bootRoute(): Promise<Route>;
}

function parseConfig(raw: unknown): { paths: { cloudSyncRoot: string } } | null {
  const classified = classifyAppConfig(raw);
  return classified.kind === "invalid" ? null : classified.config;
}

export function createIpcBootStrategy(): BootStrategy {
  return {
    async bootRoute(): Promise<Route> {
      let config: { paths: { cloudSyncRoot: string } } | null;
      try {
        const raw = await invoke<unknown>("read_app_config");
        config = parseConfig(raw);
      } catch (error) {
        if (isIpcError(error) && error.kind === "not-found") {
          return { kind: "folder-picker", reason: "first-launch" };
        }
        throw error;
      }
      if (config === null) {
        return { kind: "folder-picker", reason: "first-launch" };
      }

      const exists = await invoke<boolean>("file_exists", {
        path: config.paths.cloudSyncRoot,
      });
      if (!exists) {
        return { kind: "folder-picker", reason: "missing" };
      }

      return { kind: "library" };
    },
  };
}
