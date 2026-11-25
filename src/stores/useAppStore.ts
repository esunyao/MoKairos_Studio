import { create } from "zustand";
import type { StarterTemplateId } from "@/domain/templates/starterTemplates";

/**
 * 全局应用外壳与视图路由状态
 */

export type WorkspaceView = "launchpad" | "design" | "simulate" | "export";
export type ThemeMode = "dark" | "light";

export interface ToastItem {
  id: string;
  tone: "info" | "success" | "warn" | "error";
  title: string;
  description?: string;
}

interface AppState {
  view: WorkspaceView;
  theme: ThemeMode;
  authorName: string;
  versionDrawerOpen: boolean;
  newProjectModalOpen: boolean;
  newProjectDefaultTemplate: StarterTemplateId;
  settingsModalOpen: boolean;
  toasts: ToastItem[];

  setView: (view: WorkspaceView) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setAuthorName: (name: string) => void;
  setVersionDrawerOpen: (open: boolean) => void;
  openNewProjectModal: (templateId?: StarterTemplateId) => void;
  closeNewProjectModal: () => void;
  setSettingsModalOpen: (open: boolean) => void;
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
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
  toasts: [],

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

  pushToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 4200);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
