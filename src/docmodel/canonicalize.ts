import type { DocModel } from "../schema/docmodel";
import { AUTHORED_TYPE_RE } from "../schema/blocks/block-type-string";
import {
  DATA_FIELD_KEYS,
  GENERATION_FLAG_KEYS,
} from "../schema/generation";

const GEN_FLAGS = [...GENERATION_FLAG_KEYS];
const DATA_FIELDS = [...DATA_FIELD_KEYS];

function blockOrder(
  base: string[],
  dataBearing = false,
): string[] {
  const withoutNote = base.filter((k) => k !== "note");
  const note = base.includes("note") ? ["note"] : [];
  return [
    ...withoutNote,
    ...(dataBearing ? DATA_FIELDS : []),
    ...GEN_FLAGS,
    "breakBefore",
    "spaceBefore",
    ...note,
  ];
}

export const KEY_ORDERS: Record<string, string[]> = {
  DocModel: ["kind", "schemaVersion", "meta", "sections", "slides", "comments"],

  Meta: [
    "client",
    "project",
    "docKind",
    "sector",
    "tags",
    "language",
    "status",
    "archived",
    "confidentialityLevel",
    "owner",
    "reviewers",
    "createdAt",
    "updatedAt",
    "brandRef",
  ],

  Section: ["id", "title", "blocks"],
  Slide: ["id", "layout", "blocks", "notes"],

  BlockBase: ["id", "type"],
  // Authored blocks (ADR-0016) carry per-manifest dynamic attr fields whose
  // names aren't known here, so only the stable id/type prefix is ordered; the
  // remaining fields (attrs, note, body) follow in object order.
  AuthoredBlock: ["id", "type"],

  prose: blockOrder(["id", "type", "content", "align", "note"]),
  heading: blockOrder(["id", "type", "level", "text", "numbered", "note"]),
  "bullet-list": blockOrder(["id", "type", "items", "note"]),
  "numbered-list": blockOrder(["id", "type", "items", "startAt", "note"]),
  callout: blockOrder(["id", "type", "variant", "title", "body", "attribution", "note"]),
  "kpi-cards": blockOrder(["id", "type", "cards", "note"], true),
  chart: blockOrder(
    [
      "id",
      "type",
      "chartType",
      "title",
      "takeaway",
      "data",
      "axes",
      "palette",
      "showLegend",
      "showDataLabels",
      "legendPosition",
      "note",
    ],
    true,
  ),
  table: blockOrder(["id", "type", "columns", "rows", "caption", "note"], true),
  timeline: blockOrder(["id", "type", "orientation", "connector", "phases", "note"]),
  roadmap: blockOrder([
    "id",
    "type",
    "timeUnit",
    "startDate",
    "endDate",
    "workstreams",
    "milestones",
    "note",
  ]),
  "risk-matrix": blockOrder([
    "id",
    "type",
    "gridSize",
    "xAxisLabel",
    "yAxisLabel",
    "risks",
    "note",
  ]),
  team: blockOrder(["id", "type", "layout", "members", "note"]),
  image: blockOrder(["id", "type", "src", "alt", "caption", "width", "align", "note"]),
  diagram: blockOrder(["id", "type", "source", "title", "caption", "width", "note"]),
  divider: blockOrder(["id", "type", "label", "subtitle", "numbering", "note"]),

  DataSource: ["name", "link"],

  Comment: [
    "id",
    "blockId",
    "range",
    "quotedText",
    "status",
    "thread",
    "createdAt",
    "updatedAt",
  ],
  CommentRange: ["from", "to"],
  ThreadEntry_instruction: [
    "kind",
    "author",
    "authorEmail",
    "authorRole",
    "text",
    "createdAt",
  ],
  ThreadEntry_aiProposal: ["kind", "patch", "createdAt"],
  ThreadEntry_followUp: ["kind", "author", "authorEmail", "text", "createdAt"],

  ProseMirrorDoc: ["type", "content"],
  ProseMirrorParagraph: ["type", "content"],
  ProseMirrorText: ["type", "text", "marks"],
  ProseMirrorMark: ["type"],

  ListItem: ["text"],
  KpiCard: ["value", "label", "sublabel", "trend", "emphasis"],
  ChartData: ["series", "xLabels", "unit"],
  ChartSeries: ["name", "values", "paletteIndex"],
  ChartAxes: ["xTitle", "yTitle", "ySuffix", "yZeroBased"],
  TableColumn: ["header", "align", "width"],
  TableRow: ["cells"],
  TimelinePhase: ["label", "subtitle", "body", "duration"],
  RoadmapWorkstream: ["label", "startDate", "endDate", "color"],
  RoadmapMilestone: ["label", "date"],
  RiskItem: ["label", "x", "y", "severity"],
  TeamMember: ["name", "role", "photo", "allocation", "bio"],
  BlockPatch: ["blockId", "path", "value"],
};

export function resolveChildShape(
  parentShape: string,
  key: string,
  value: unknown,
): string {
  return childShapeFor(parentShape, key, value);
}

export function resolveArrayItemShape(
  parentArrayShape: string,
  item: unknown,
): string {
  return inferShapeForArrayItem(parentArrayShape, item);
}

export function canonicalize<T>(value: T): T {
  return canonicalizeValue(value, "DocModel") as T;
}

function canonicalizeValue(value: unknown, shapeName: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const childShape = inferShapeForArrayItem(shapeName, item);
      return canonicalizeValue(item, childShape);
    });
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const order = KEY_ORDERS[shapeName] ?? [];
    const orderedKeys = [
      ...order.filter((k) => k in obj),
      ...Object.keys(obj).filter((k) => !order.includes(k)),
    ];
    const out: Record<string, unknown> = {};
    for (const k of orderedKeys) {
      if (obj[k] === undefined) continue;
      out[k] = canonicalizeValue(obj[k], childShapeFor(shapeName, k, obj[k]));
    }
    return out;
  }
  return value;
}

function childShapeFor(
  parentShape: string,
  key: string,
  value: unknown,
): string {
  if (parentShape === "DocModel" && key === "meta") return "Meta";
  if (parentShape === "DocModel" && key === "sections") return "_arrayOfSection";
  if (parentShape === "DocModel" && key === "slides") return "_arrayOfSlide";
  if (parentShape === "DocModel" && key === "comments") return "_arrayOfComment";

  if (parentShape === "Section" && key === "blocks") return "_arrayOfBlock";
  if (parentShape === "Slide" && key === "blocks") return "_arrayOfBlock";

  if (parentShape === "Comment" && key === "thread") return "_arrayOfThreadEntry";
  if (parentShape === "Comment" && key === "range") return "CommentRange";

  if (key === "content" && isProseMirrorDoc(value)) return "ProseMirrorDoc";
  if (key === "body" && isProseMirrorDoc(value)) return "ProseMirrorDoc";
  if (key === "text" && isProseMirrorDoc(value)) return "ProseMirrorDoc";

  if (parentShape === "chart" && key === "data") return "ChartData";
  if (parentShape === "chart" && key === "axes") return "ChartAxes";
  if (
    (parentShape === "chart" ||
      parentShape === "table" ||
      parentShape === "kpi-cards") &&
    key === "source"
  ) {
    return "DataSource";
  }
  if (parentShape === "ChartData" && key === "series") return "_arrayOfChartSeries";

  if (parentShape === "table" && key === "columns") return "_arrayOfTableColumn";
  if (parentShape === "table" && key === "rows") return "_arrayOfTableRow";
  if (parentShape === "TableRow" && key === "cells") return "_arrayOfProseMirrorDoc";

  if (parentShape === "timeline" && key === "phases") return "_arrayOfTimelinePhase";
  if (parentShape === "roadmap" && key === "workstreams") {
    return "_arrayOfRoadmapWorkstream";
  }
  if (parentShape === "roadmap" && key === "milestones") {
    return "_arrayOfRoadmapMilestone";
  }
  if (parentShape === "risk-matrix" && key === "risks") return "_arrayOfRiskItem";
  if (parentShape === "team" && key === "members") return "_arrayOfTeamMember";
  if (parentShape === "kpi-cards" && key === "cards") return "_arrayOfKpiCard";

  if (
    parentShape === "bullet-list" ||
    parentShape === "numbered-list"
  ) {
    if (key === "items") return "_arrayOfListItem";
  }

  if (parentShape === "ProseMirrorDoc" && key === "content") {
    return "_arrayOfProseMirrorNode";
  }
  if (parentShape === "ProseMirrorParagraph" && key === "content") {
    return "_arrayOfProseMirrorInline";
  }
  if (parentShape === "ProseMirrorText" && key === "marks") {
    return "_arrayOfProseMirrorMark";
  }

  if (parentShape === "ThreadEntry_aiProposal" && key === "patch") {
    return "BlockPatch";
  }

  return shapeForTypedObject(value);
}

function inferShapeForArrayItem(
  parentArrayShape: string,
  item: unknown,
): string {
  if (parentArrayShape === "_arrayOfSection") return "Section";
  if (parentArrayShape === "_arrayOfSlide") return "Slide";
  if (parentArrayShape === "_arrayOfComment") return "Comment";
  if (parentArrayShape === "_arrayOfBlock") {
    const t = (item as { type?: string })?.type ?? "";
    if (t && KEY_ORDERS[t]) return t;
    // Authored blocks have dynamic `{sender}:{slug}` types not in KEY_ORDERS.
    if (AUTHORED_TYPE_RE.test(t)) return "AuthoredBlock";
    if (t) {
      throw new Error(`canonicalize: missing KEY_ORDERS for block type "${t}"`);
    }
    return "BlockBase";
  }
  if (parentArrayShape === "_arrayOfThreadEntry") {
    const k = (item as { kind?: string })?.kind ?? "";
    if (k === "instruction") return "ThreadEntry_instruction";
    if (k === "ai-proposal") return "ThreadEntry_aiProposal";
    if (k === "follow-up") return "ThreadEntry_followUp";
    return "_unknown";
  }
  if (parentArrayShape === "_arrayOfChartSeries") return "ChartSeries";
  if (parentArrayShape === "_arrayOfTableColumn") return "TableColumn";
  if (parentArrayShape === "_arrayOfTableRow") return "TableRow";
  if (parentArrayShape === "_arrayOfProseMirrorDoc") return "ProseMirrorDoc";
  if (parentArrayShape === "_arrayOfTimelinePhase") return "TimelinePhase";
  if (parentArrayShape === "_arrayOfRoadmapWorkstream") return "RoadmapWorkstream";
  if (parentArrayShape === "_arrayOfRoadmapMilestone") return "RoadmapMilestone";
  if (parentArrayShape === "_arrayOfRiskItem") return "RiskItem";
  if (parentArrayShape === "_arrayOfTeamMember") return "TeamMember";
  if (parentArrayShape === "_arrayOfKpiCard") return "KpiCard";
  if (parentArrayShape === "_arrayOfListItem") return "ListItem";
  if (parentArrayShape === "_arrayOfProseMirrorNode") {
    return shapeForTypedObject(item);
  }
  if (parentArrayShape === "_arrayOfProseMirrorInline") {
    return shapeForTypedObject(item);
  }
  if (parentArrayShape === "_arrayOfProseMirrorMark") return "ProseMirrorMark";
  return "_unknown";
}

function isProseMirrorDoc(value: unknown): value is { type: string } {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: string }).type === "doc"
  );
}

function shapeForTypedObject(value: unknown): string {
  if (!value || typeof value !== "object") return "_unknown";
  const t = (value as { type?: string }).type;
  if (typeof t === "string") {
    if (t === "doc") return "ProseMirrorDoc";
    if (t === "paragraph") return "ProseMirrorParagraph";
    if (t === "text") return "ProseMirrorText";
    if (KEY_ORDERS[t]) return t;
  }
  return "_unknown";
}

export function assertBlockTypesRegistered(types: readonly string[]): void {
  for (const type of types) {
    if (!KEY_ORDERS[type]) {
      throw new Error(`canonicalize: missing KEY_ORDERS for block type "${type}"`);
    }
  }
}

export function canonicalizeDocModel(doc: DocModel): DocModel {
  return canonicalize(doc);
}
