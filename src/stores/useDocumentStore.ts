import { create } from "zustand";
import {
  GRAPHIC_KIND_MAP,
  type GraphicKind,
  type RobotRole2027,
} from "@/domain/protocol/constants";
import {
  getGraphicRmBoundingBox,
  normalizeGraphic,
  translateGraphicRm,
} from "@/domain/protocol/geometry";
import { allocateFigureName, createStableId } from "@/domain/protocol/naming";
import type {
  MkuiDocument,
  MkuiFrame,
  MkuiGraphic,
  MkuiGroup,
} from "@/domain/protocol/types";
import { createDocumentFromTemplate } from "@/domain/templates/starterTemplates";
import { useProjectStore } from "./useProjectStore";

/**
 * 工程设计文档唯一数据源 Store（RM 左下角原点）
 * 支持多 Frame、Group 管理、图元 CRUD、批量属性修改、对齐与 80 步撤销/重做栈
 */

const MAX_HISTORY_STEPS = 80;

export type AlignMode =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "centerY"
  | "bottom"
  | "canvasCenter";

interface DocumentState {
  doc: MkuiDocument;
  past: MkuiDocument[];
  future: MkuiDocument[];

  loadDocument: (doc: MkuiDocument) => void;
  replaceDocumentFromVersion: (doc: MkuiDocument) => void;
  updateMeta: (patch: Partial<Pick<MkuiDocument, "name" | "description" | "robotRole">>) => void;

  // 历史撤销与重做
  undo: () => void;
  redo: () => void;

  // Frame 操作
  setActiveFrame: (frameId: string) => void;
  addFrame: (name: string) => string;
  duplicateFrame: (frameId: string, newName: string) => string | null;
  renameFrame: (frameId: string, newName: string) => void;
  deleteFrame: (frameId: string) => void;

  // Group 操作
  addGroup: (name: string) => string;
  renameGroup: (groupId: string, name: string) => void;
  toggleGroupProp: (groupId: string, key: "visible" | "locked" | "collapsed") => void;
  deleteGroup: (groupId: string) => void;

  // 图元 CRUD
  addGraphic: (
    kind: GraphicKind,
    options?: {
      rmX?: number;
      rmY?: number;
      endRmX?: number;
      endRmY?: number;
      groupId?: string;
    },
  ) => MkuiGraphic;
  updateGraphic: (graphicId: string, patch: Partial<MkuiGraphic>, recordHistory?: boolean) => void;
  updateGraphicsBatch: (
    graphicIds: string[],
    patch: Partial<MkuiGraphic>,
  ) => void;
  deleteGraphics: (graphicIds: string[]) => void;
  duplicateGraphics: (graphicIds: string[]) => MkuiGraphic[];
  moveGraphicsDelta: (graphicIds: string[], dxRm: number, dyRm: number) => void;
  alignGraphics: (graphicIds: string[], mode: AlignMode) => void;
}

function touchDoc(doc: MkuiDocument): MkuiDocument {
  return { ...doc, updatedAt: new Date().toISOString() };
}

function getActiveFrame(doc: MkuiDocument): MkuiFrame {
  return doc.frames.find((f) => f.id === doc.activeFrameId) ?? doc.frames[0];
}

function mapActiveFrame(
  doc: MkuiDocument,
  updater: (frame: MkuiFrame) => MkuiFrame,
): MkuiDocument {
  const active = getActiveFrame(doc);
  return touchDoc({
    ...doc,
    frames: doc.frames.map((f) => (f.id === active.id ? updater(f) : f)),
  });
}

function createDefaultGraphic(
  kind: GraphicKind,
  usedNames: Set<string>,
  groupId: string,
  opts?: { rmX?: number; rmY?: number; endRmX?: number; endRmY?: number },
): MkuiGraphic {
  const meta = GRAPHIC_KIND_MAP[kind];
  const figureName = allocateFigureName(usedNames);
  const cx = Math.round(opts?.rmX ?? 960);
  const cy = Math.round(opts?.rmY ?? 540);
  const base = {
    id: createStableId("g"),
    figureName,
    displayName: `${meta.label}_${figureName}`,
    groupId,
    layer: 2 as const,
    color: 6 as const,
    lineWidth: 2,
    dynamic: kind === "float" || kind === "int",
    visible: true,
    locked: false,
  };

  switch (kind) {
    case "line":
      return normalizeGraphic({
        ...base,
        kind: "line",
        startX: cx,
        startY: cy,
        endX: opts?.endRmX ?? cx + 140,
        endY: opts?.endRmY ?? cy,
      });
    case "rect": {
      const x2 = opts?.endRmX ?? cx + 160;
      const y2 = opts?.endRmY ?? cy + 100;
      return normalizeGraphic({
        ...base,
        kind: "rect",
        startX: cx,
        startY: cy,
        endX: x2,
        endY: y2,
      });
    }
    case "circle":
      return normalizeGraphic({
        ...base,
        kind: "circle",
        centerX: cx,
        centerY: cy,
        radius: 65,
      });
    case "ellipse":
      return normalizeGraphic({
        ...base,
        kind: "ellipse",
        centerX: cx,
        centerY: cy,
        rx: 95,
        ry: 55,
      });
    case "arc":
      return normalizeGraphic({
        ...base,
        kind: "arc",
        centerX: cx,
        centerY: cy,
        rx: 120,
        ry: 120,
        startAngle: 30,
        endAngle: 150,
        lineWidth: 5,
      });
    case "float":
      return normalizeGraphic({
        ...base,
        kind: "float",
        x: cx,
        y: cy,
        fontSize: 22,
        value: 24.5,
      });
    case "int":
      return normalizeGraphic({
        ...base,
        kind: "int",
        x: cx,
        y: cy,
        fontSize: 22,
        value: 100,
      });
    case "text":
      return normalizeGraphic({
        ...base,
        kind: "text",
        x: cx,
        y: cy,
        fontSize: 22,
        text: "STATUS: OK",
      });
  }
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  const commitDoc = (nextDoc: MkuiDocument, recordHistory = true) => {
    const prev = get().doc;
    if (recordHistory) {
      const nextPast = [...get().past, prev].slice(-MAX_HISTORY_STEPS);
      set({ doc: nextDoc, past: nextPast, future: [] });
    } else {
      set({ doc: nextDoc });
    }
    useProjectStore.getState().setDirty(true, nextDoc.name);
  };

  return {
    doc: createDocumentFromTemplate("infantry_combat", "Infantry_Combat_HUD", "infantry_3"),
    past: [],
    future: [],

    loadDocument: (doc) => set({ doc, past: [], future: [] }),

    replaceDocumentFromVersion: (doc) => {
      commitDoc(touchDoc(doc), true);
    },

    updateMeta: (patch) => {
      const next = touchDoc({
        ...get().doc,
        ...patch,
        robotRole: (patch.robotRole ?? get().doc.robotRole) as RobotRole2027,
      });
      commitDoc(next, true);
    },

    undo: () => {
      const { past, doc, future } = get();
      if (past.length === 0) {
        return;
      }
      const previous = past[past.length - 1];
      set({
        doc: previous,
        past: past.slice(0, -1),
        future: [doc, ...future].slice(0, MAX_HISTORY_STEPS),
      });
      useProjectStore.getState().setDirty(true, previous.name);
    },

    redo: () => {
      const { past, doc, future } = get();
      if (future.length === 0) {
        return;
      }
      const next = future[0];
      set({
        doc: next,
        past: [...past, doc].slice(-MAX_HISTORY_STEPS),
        future: future.slice(1),
      });
      useProjectStore.getState().setDirty(true, next.name);
    },

    setActiveFrame: (frameId) => {
      const exists = get().doc.frames.some((f) => f.id === frameId);
      if (!exists) {
        return;
      }
      set({ doc: { ...get().doc, activeFrameId: frameId } });
    },

    addFrame: (name) => {
      const id = createStableId("frm");
      const defaultGroup: MkuiGroup = {
        id: createStableId("grp"),
        name: "Default",
        visible: true,
        locked: false,
        collapsed: false,
      };
      const nextFrame: MkuiFrame = {
        id,
        name: name.trim() || `Frame_${get().doc.frames.length + 1}`,
        groups: [defaultGroup],
        graphics: [],
      };
      commitDoc(
        touchDoc({
          ...get().doc,
          activeFrameId: id,
          frames: [...get().doc.frames, nextFrame],
        }),
      );
      return id;
    },

    duplicateFrame: (frameId, newName) => {
      const src = get().doc.frames.find((f) => f.id === frameId);
      if (!src) {
        return null;
      }
      const newId = createStableId("frm");
      const groupIdMap = new Map<string, string>();
      const groups: MkuiGroup[] = src.groups.map((g) => {
        const gid = createStableId("grp");
        groupIdMap.set(g.id, gid);
        return { ...g, id: gid };
      });
      const graphics: MkuiGraphic[] = src.graphics.map((g) => ({
        ...g,
        id: createStableId("g"),
        groupId: groupIdMap.get(g.groupId) ?? groups[0]?.id ?? "",
      }));
      const cloned: MkuiFrame = {
        id: newId,
        name: newName.trim() || `${src.name}_copy`,
        groups,
        graphics,
      };
      commitDoc(
        touchDoc({
          ...get().doc,
          activeFrameId: newId,
          frames: [...get().doc.frames, cloned],
        }),
      );
      return newId;
    },

    renameFrame: (frameId, newName) => {
      const trimmed = newName.trim();
      if (!trimmed) {
        return;
      }
      commitDoc(
        touchDoc({
          ...get().doc,
          frames: get().doc.frames.map((f) =>
            f.id === frameId ? { ...f, name: trimmed } : f,
          ),
        }),
      );
    },

    deleteFrame: (frameId) => {
      const frames = get().doc.frames;
      if (frames.length <= 1) {
        return;
      }
      const remaining = frames.filter((f) => f.id !== frameId);
      const nextActive =
        get().doc.activeFrameId === frameId
          ? remaining[0].id
          : get().doc.activeFrameId;
      commitDoc(
        touchDoc({
          ...get().doc,
          activeFrameId: nextActive,
          frames: remaining,
        }),
      );
    },

    addGroup: (name) => {
      const id = createStableId("grp");
      const nextGroup: MkuiGroup = {
        id,
        name: name.trim() || "New_Group",
        visible: true,
        locked: false,
        collapsed: false,
      };
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          groups: [...frame.groups, nextGroup],
        })),
      );
      return id;
    },

    renameGroup: (groupId, name) => {
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          groups: frame.groups.map((g) =>
            g.id === groupId ? { ...g, name: trimmed } : g,
          ),
        })),
      );
    },

    toggleGroupProp: (groupId, key) => {
      const recordHistory = key !== "collapsed";
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          groups: frame.groups.map((g) =>
            g.id === groupId ? { ...g, [key]: !g[key] } : g,
          ),
        })),
        recordHistory,
      );
    },

    deleteGroup: (groupId) => {
      const active = getActiveFrame(get().doc);
      if (active.groups.length <= 1) {
        return;
      }
      const fallbackGroupId = active.groups.find((g) => g.id !== groupId)?.id;
      if (!fallbackGroupId) {
        return;
      }
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          groups: frame.groups.filter((g) => g.id !== groupId),
          graphics: frame.graphics.map((item) =>
            item.groupId === groupId ? { ...item, groupId: fallbackGroupId } : item,
          ),
        })),
      );
    },

    addGraphic: (kind, options) => {
      const active = getActiveFrame(get().doc);
      const usedNames = new Set(active.graphics.map((g) => g.figureName));
      let groupId = options?.groupId ?? active.groups[0]?.id;
      let extraGroups = active.groups;
      if (!groupId) {
        const createdGrp: MkuiGroup = {
          id: createStableId("grp"),
          name: "Default",
          visible: true,
          locked: false,
          collapsed: false,
        };
        groupId = createdGrp.id;
        extraGroups = [createdGrp];
      }
      const created = createDefaultGraphic(kind, usedNames, groupId, options);
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          groups: extraGroups,
          graphics: [...frame.graphics, created],
        })),
      );
      return created;
    },

    updateGraphic: (graphicId, patch, recordHistory = true) => {
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          graphics: frame.graphics.map((g) =>
            g.id === graphicId
              ? normalizeGraphic({ ...g, ...patch } as MkuiGraphic)
              : g,
          ),
        })),
        recordHistory,
      );
    },

    updateGraphicsBatch: (graphicIds, patch) => {
      const idSet = new Set(graphicIds);
      if (idSet.size === 0) {
        return;
      }
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          graphics: frame.graphics.map((g) =>
            idSet.has(g.id)
              ? normalizeGraphic({ ...g, ...patch } as MkuiGraphic)
              : g,
          ),
        })),
      );
    },

    deleteGraphics: (graphicIds) => {
      const idSet = new Set(graphicIds);
      if (idSet.size === 0) {
        return;
      }
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          graphics: frame.graphics.filter((g) => !idSet.has(g.id)),
        })),
      );
    },

    duplicateGraphics: (graphicIds) => {
      const active = getActiveFrame(get().doc);
      const idSet = new Set(graphicIds);
      const sources = active.graphics.filter((g) => idSet.has(g.id));
      if (sources.length === 0) {
        return [];
      }
      const usedNames = new Set(active.graphics.map((g) => g.figureName));
      const duplicated = sources.map((src) => {
        const nextFigureName = allocateFigureName(usedNames, src.figureName);
        usedNames.add(nextFigureName);
        const shifted = translateGraphicRm(src, 24, -24);
        return {
          ...shifted,
          id: createStableId("g"),
          figureName: nextFigureName,
          displayName: `${src.displayName}_副本`,
        };
      });
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          graphics: [...frame.graphics, ...duplicated],
        })),
      );
      return duplicated;
    },

    moveGraphicsDelta: (graphicIds, dxRm, dyRm) => {
      const idSet = new Set(graphicIds);
      if (idSet.size === 0 || (dxRm === 0 && dyRm === 0)) {
        return;
      }
      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          graphics: frame.graphics.map((g) =>
            idSet.has(g.id) ? translateGraphicRm(g, dxRm, dyRm) : g,
          ),
        })),
      );
    },

    alignGraphics: (graphicIds, mode) => {
      const active = getActiveFrame(get().doc);
      const targets = active.graphics.filter((g) => graphicIds.includes(g.id));
      if (targets.length === 0) {
        return;
      }

      const boxes = targets.map((g) => ({
        graphic: g,
        box: getGraphicRmBoundingBox(g),
      }));

      const groupMinX = Math.min(...boxes.map((b) => b.box.minX));
      const groupMaxX = Math.max(...boxes.map((b) => b.box.maxX));
      const groupMinY = Math.min(...boxes.map((b) => b.box.minY));
      const groupMaxY = Math.max(...boxes.map((b) => b.box.maxY));
      const groupMidX = Math.round((groupMinX + groupMaxX) / 2);
      const groupMidY = Math.round((groupMinY + groupMaxY) / 2);

      const moveMap = new Map<string, MkuiGraphic>();
      for (const { graphic, box } of boxes) {
        const w = box.maxX - box.minX;
        const h = box.maxY - box.minY;
        const midX = Math.round((box.minX + box.maxX) / 2);
        const midY = Math.round((box.minY + box.maxY) / 2);
        let dx = 0;
        let dy = 0;

        switch (mode) {
          case "left":
            dx = groupMinX - box.minX;
            break;
          case "right":
            dx = groupMaxX - box.maxX;
            break;
          case "centerX":
            dx = groupMidX - midX;
            break;
          case "bottom":
            dy = groupMinY - box.minY;
            break;
          case "top":
            dy = groupMaxY - box.maxY;
            break;
          case "centerY":
            dy = groupMidY - midY;
            break;
          case "canvasCenter":
            dx = 960 - (box.minX + Math.round(w / 2));
            dy = 540 - (box.minY + Math.round(h / 2));
            break;
        }
        moveMap.set(graphic.id, translateGraphicRm(graphic, dx, dy));
      }

      commitDoc(
        mapActiveFrame(get().doc, (frame) => ({
          ...frame,
          graphics: frame.graphics.map((g) => moveMap.get(g.id) ?? g),
        })),
      );
    },
  };
});
