import { create } from "zustand";
import type { GraphicKind } from "@/domain/protocol/constants";
import type { LayerIndex, MkuiGraphic } from "@/domain/protocol/types";

/**
 * 画布视口、绘制工具、图层过滤与参考背景状态 Store
 */

export type CanvasTool = "select" | "pan" | GraphicKind;

interface CanvasState {
  activeTool: CanvasTool;
  selectedIds: string[];
  clipboard: MkuiGraphic[];
  visibleLayers: Record<LayerIndex, boolean>;
  isolatedLayer: LayerIndex | null;
  previewTeam: "red" | "blue";
  showGrid: boolean;
  showBackground: boolean;
  backgroundOpacity: number;
  customBackgroundUrl: string | null;
  scale: number;
  offsetX: number;
  offsetY: number;
  cursorRm: { x: number; y: number } | null;

  setActiveTool: (tool: CanvasTool) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setClipboard: (items: MkuiGraphic[]) => void;
  toggleLayerVisible: (layer: LayerIndex) => void;
  isolateLayer: (layer: LayerIndex | null) => void;
  setPreviewTeam: (team: "red" | "blue") => void;
  toggleGrid: () => void;
  toggleBackground: () => void;
  setBackgroundOpacity: (opacity: number) => void;
  setCustomBackgroundUrl: (url: string | null) => void;
  setViewport: (scale: number, offsetX: number, offsetY: number) => void;
  setCursorRm: (coord: { x: number; y: number } | null) => void;
}

const ALL_LAYERS_VISIBLE: Record<LayerIndex, boolean> = {
  0: true,
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
  6: true,
  7: true,
  8: true,
  9: true,
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  activeTool: "select",
  selectedIds: [],
  clipboard: [],
  visibleLayers: { ...ALL_LAYERS_VISIBLE },
  isolatedLayer: null,
  previewTeam: "red",
  showGrid: true,
  showBackground: true,
  backgroundOpacity: 0.9,
  customBackgroundUrl: null,
  scale: 0.55,
  offsetX: 60,
  offsetY: 40,
  cursorRm: null,

  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  toggleSelection: (id) => {
    const current = get().selectedIds;
    if (current.includes(id)) {
      set({ selectedIds: current.filter((item) => item !== id) });
    } else {
      set({ selectedIds: [...current, id] });
    }
  },
  clearSelection: () => set({ selectedIds: [] }),
  setClipboard: (clipboard) => set({ clipboard }),

  toggleLayerVisible: (layer) =>
    set((s) => ({
      isolatedLayer: null,
      visibleLayers: {
        ...s.visibleLayers,
        [layer]: !s.visibleLayers[layer],
      },
    })),

  isolateLayer: (layer) => {
    const current = get().isolatedLayer;
    if (layer === null || current === layer) {
      set({ isolatedLayer: null, visibleLayers: { ...ALL_LAYERS_VISIBLE } });
      return;
    }
    const next = { ...ALL_LAYERS_VISIBLE };
    (Object.keys(next) as unknown as LayerIndex[]).forEach((k) => {
      next[k] = Number(k) === layer;
    });
    set({ isolatedLayer: layer, visibleLayers: next });
  },

  setPreviewTeam: (previewTeam) => set({ previewTeam }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleBackground: () => set((s) => ({ showBackground: !s.showBackground })),
  setBackgroundOpacity: (backgroundOpacity) => set({ backgroundOpacity }),
  setCustomBackgroundUrl: (customBackgroundUrl) => set({ customBackgroundUrl }),
  setViewport: (scale, offsetX, offsetY) => set({ scale, offsetX, offsetY }),
  setCursorRm: (cursorRm) => set({ cursorRm }),
}));
