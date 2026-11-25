import { create } from "zustand";
import type { StarterTemplateId } from "@/domain/templates/starterTemplates";

/**
 * 全局应用外壳、视图路由、主题与弹窗状态
 */

export type WorkspaceView = "launchpad" | "design" | "simulate" | "export";
export type ThemeMode = "dark" | "light";

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

function readInitialAuthor(): string {
  if (typeof window === "undefined") {
    return "Designer";
  }
  return localStorage.getItem("mokairos.author") || "Designer";
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "launchpad",
  theme: readInitialTheme(),
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
