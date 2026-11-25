import { create } from "zustand";
import type { StarterTemplateId } from "@/domain/templates/starterTemplates";

/**
 * 全局应用外壳、视图路由、主题与弹窗状态
 */

export type WorkspaceView = "launchpad" | "design" | "simulate" | "export";
export type ThemeMode = "dark" | "light";
export type SurfaceStyle = "liquid" | "standard";
export type LiquidGlassMode = "standard" | "polar" | "prominent" | "shader";

export interface LiquidGlassConfig {
  mode: LiquidGlassMode;
  displacementScale: number;
  blurAmount: number;
  saturation: number;
  aberrationIntensity: number;
  elasticity: number;
  overLight: boolean;
  adaptiveContrast: boolean;
}

export const DEFAULT_LIQUID_GLASS_CONFIG: LiquidGlassConfig = {
  mode: "standard",
  displacementScale: 70,
  blurAmount: 0.2,
  saturation: 140,
  aberrationIntensity: 2,
  elasticity: 0.55,
  overLight: false,
  adaptiveContrast: true,
};

export interface UnsavedPromptState {
  title: string;
  description: string;
  saveAndContinueLabel: string;
  discardLabel: string;
  onSaveAndContinue: () => Promise<void> | void;
  onDiscard: () => Promise<void> | void;
}

interface AppState {
  view: WorkspaceView;
  theme: ThemeMode;
  surfaceStyle: SurfaceStyle;
  liquidGlass: LiquidGlassConfig;
  authorName: string;
  versionDrawerOpen: boolean;
  newProjectModalOpen: boolean;
  newProjectDefaultTemplate: StarterTemplateId;
  settingsModalOpen: boolean;
  shortcutsModalOpen: boolean;
  unsavedPrompt: UnsavedPromptState | null;

  setView: (view: WorkspaceView) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSurfaceStyle: (style: SurfaceStyle) => void;
  toggleSurfaceStyle: () => void;
  updateLiquidGlass: (patch: Partial<LiquidGlassConfig>) => void;
  resetLiquidGlass: () => void;
  setAuthorName: (name: string) => void;
  setVersionDrawerOpen: (open: boolean) => void;
  openNewProjectModal: (templateId?: StarterTemplateId) => void;
  closeNewProjectModal: () => void;
  setSettingsModalOpen: (open: boolean) => void;
  setShortcutsModalOpen: (open: boolean) => void;
  openUnsavedPrompt: (prompt: UnsavedPromptState) => void;
  closeUnsavedPrompt: () => void;
}

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }
  const stored = localStorage.getItem("mokairos.theme");
  return stored === "light" ? "light" : "dark";
}

function readInitialSurfaceStyle(): SurfaceStyle {
  if (typeof window === "undefined") {
    return "liquid";
  }
  const stored = localStorage.getItem("mokairos.surfaceStyle");
  return stored === "standard" ? "standard" : "liquid";
}

function readInitialLiquidGlass(): LiquidGlassConfig {
  if (typeof window === "undefined") {
    return { ...DEFAULT_LIQUID_GLASS_CONFIG };
  }
  try {
    const raw = localStorage.getItem("mokairos.liquidGlass");
    if (!raw) return { ...DEFAULT_LIQUID_GLASS_CONFIG };
    const parsed = JSON.parse(raw) as Partial<LiquidGlassConfig>;
    return {
      ...DEFAULT_LIQUID_GLASS_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_LIQUID_GLASS_CONFIG };
  }
}

function readInitialAuthor(): string {
  if (typeof window === "undefined") {
    return "Designer";
  }
  return localStorage.getItem("mokairos.author") || "Designer";
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "launchpad",
  theme: readInitialTheme(),
  surfaceStyle: readInitialSurfaceStyle(),
  liquidGlass: readInitialLiquidGlass(),
  authorName: readInitialAuthor(),
  versionDrawerOpen: false,
  newProjectModalOpen: false,
  newProjectDefaultTemplate: "infantry_combat",
  settingsModalOpen: false,
  shortcutsModalOpen: false,
  unsavedPrompt: null,

  setView: (view) => set({ view }),

  setTheme: (theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("mokairos.theme", theme);
    }
    set({ theme });
  },

  toggleTheme: () => {
    const next: ThemeMode = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },

  setSurfaceStyle: (surfaceStyle) => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.surface = surfaceStyle;
      localStorage.setItem("mokairos.surfaceStyle", surfaceStyle);
    }
    set({ surfaceStyle });
  },

  toggleSurfaceStyle: () => {
    const next: SurfaceStyle =
      get().surfaceStyle === "liquid" ? "standard" : "liquid";
    get().setSurfaceStyle(next);
  },

  updateLiquidGlass: (patch) => {
    const next = { ...get().liquidGlass, ...patch };
    if (typeof window !== "undefined") {
      localStorage.setItem("mokairos.liquidGlass", JSON.stringify(next));
    }
    set({ liquidGlass: next });
  },

  resetLiquidGlass: () => {
    const next = { ...DEFAULT_LIQUID_GLASS_CONFIG };
    if (typeof window !== "undefined") {
      localStorage.setItem("mokairos.liquidGlass", JSON.stringify(next));
    }
    set({ liquidGlass: next });
  },

  setAuthorName: (name) => {
    const trimmed = name.trim() || "Designer";
    if (typeof window !== "undefined") {
      localStorage.setItem("mokairos.author", trimmed);
    }
    set({ authorName: trimmed });
  },

  setVersionDrawerOpen: (open) => set({ versionDrawerOpen: open }),

  openNewProjectModal: (templateId = "infantry_combat") =>
    set({
      newProjectModalOpen: true,
      newProjectDefaultTemplate: templateId,
    }),

  closeNewProjectModal: () => set({ newProjectModalOpen: false }),

  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),

  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),

  openUnsavedPrompt: (unsavedPrompt) => set({ unsavedPrompt }),

  closeUnsavedPrompt: () => set({ unsavedPrompt: null }),
}));
