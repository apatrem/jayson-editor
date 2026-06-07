/**
 * Aggregated readiness gate — advisory blockers; export always allowed.
 * Spec: docs/GENERATION_PIPELINE.md §7, docs/UI_READINESS_GATE.md
 */

import type { DocModel } from "../schema/docmodel";
import {
  isDataBearingBlockType,
  readDataState,
  type DataState,
} from "../schema/generation";

export type BlockerKind =
  | "data-not-confirmed"
  | "degraded-to-prose"
  | "layout-overflow"
  | "contradiction"
  | "missing-source-for-verify";

export interface ReadinessBlocker {
  kind: BlockerKind;
  blockId: string;
  blockType: string;
  message: string;
}

export interface ReadinessSnapshot {
  blockers: ReadinessBlocker[];
  /** True when no readiness flags remain (checklist empty). Does not gate export. */
  allClear: boolean;
}

export function collectReadinessBlockers(doc: DocModel): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  const blocks =
    doc.kind === "document"
      ? doc.sections.flatMap((s) => s.blocks)
      : doc.slides.flatMap((s) => s.blocks);

  for (const block of blocks) {
    const record = block as Record<string, unknown>;
    const blockId = String(record.id ?? "");
    const blockType = String(record.type ?? "");

    if (record.degradedToProse === true) {
      blockers.push({
        kind: "degraded-to-prose",
        blockId,
        blockType,
        message: "Block was degraded to prose — needs structuring review.",
      });
    }

    if (record.layoutOverflow === true) {
      blockers.push({
        kind: "layout-overflow",
        blockId,
        blockType,
        message: "Slide layout overflow — content may be split or truncated.",
      });
    }

    if (record.contradictionFlag === true) {
      blockers.push({
        kind: "contradiction",
        blockId,
        blockType,
        message: "Coherence pass flagged a potential contradiction.",
      });
    }

    if (!isDataBearingBlockType(blockType)) continue;

    const dataState = readDataState(record) ?? "empty";
    if (dataState !== "confirmed") {
      blockers.push({
        kind: "data-not-confirmed",
        blockId,
        blockType,
        message: `Data is ${dataState} — mark verified after confirming source.`,
      });
    }

    if (dataState === "confirmed" && !hasSource(record)) {
      blockers.push({
        kind: "missing-source-for-verify",
        blockId,
        blockType,
        message: "Block marked confirmed but has no human-provided source.",
      });
    }
  }

  return blockers;
}

export function readinessSnapshot(doc: DocModel): ReadinessSnapshot {
  const blockers = collectReadinessBlockers(doc);
  return {
    blockers,
    allClear: blockers.length === 0,
  };
}

/** Export is never blocked — blockers drive the export summary popup and watermarks. */
export function canExport(_doc: DocModel): boolean {
  return true;
}

function hasSource(block: Record<string, unknown>): boolean {
  const source = block.source;
  if (source === null || typeof source !== "object") return false;
  const name = (source as { name?: unknown }).name;
  return typeof name === "string" && name.trim().length > 0;
}

/** Editing data or source after verification should revert dataState (GENERATION_PIPELINE §6). */
export function dataStateAfterEdit(previous: DataState | undefined): DataState {
  if (previous === "confirmed") return "draft-illustrative";
  return previous ?? "empty";
}
