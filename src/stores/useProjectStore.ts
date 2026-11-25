import { create } from "zustand";
import type { MkuiDocument, RecentProjectEntry } from "@/domain/protocol/types";
import { loadRecentProjects, saveRecentProjects } from "@/services/recentProjectsService";
import { syncWindowTitle } from "@/services/windowService";

/**
 * 工程路径、脏状态、最近工程清单管理 Store
 */

interface ProjectState {
  hasOpenProject: boolean;
  filePath: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;
  lastArchiveBytes: number | null;
  lastMsgpackBytes: number | null;
  recentProjects: RecentProjectEntry[];

  markOpened: (params: {
    filePath: string | null;
    doc: MkuiDocument;
    archiveBytes?: number | null;
    msgpackBytes?: number | null;
    commitCount?: number;
    headCommitId?: string | null;
  }) => Promise<void>;
  markSaved: (params: {
    filePath: string;
    doc: MkuiDocument;
    archiveBytes: number;
    msgpackBytes: number;
    commitCount: number;
    headCommitId: string | null;
  }) => Promise<void>;
  setDirty: (dirty: boolean, projectName?: string) => void;
  closeProject: () => void;
  refreshRecentProjects: () => Promise<void>;
  removeRecentProject: (filePath: string) => Promise<void>;
}

function toRecentEntry(params: {
  filePath: string;
  doc: MkuiDocument;
  commitCount: number;
  headCommitId: string | null;
}): RecentProjectEntry {
  const graphicCount = params.doc.frames.reduce(
    (sum, f) => sum + f.graphics.length,
    0,
  );
  return {
    projectId: params.doc.projectId,
    name: params.doc.name,
    filePath: params.filePath,
    robotRole: params.doc.robotRole,
    frameCount: params.doc.frames.length,
    graphicCount,
    headCommitId: params.headCommitId,
    commitCount: params.commitCount,
    updatedAt: new Date().toISOString(),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  hasOpenProject: false,
  filePath: null,
  isDirty: false,
  lastSavedAt: null,
  lastArchiveBytes: null,
  lastMsgpackBytes: null,
  recentProjects: [],

  markOpened: async ({
    filePath,
    doc,
    archiveBytes = null,
    msgpackBytes = null,
    commitCount = 0,
    headCommitId = null,
  }) => {
    set({
      hasOpenProject: true,
      filePath,
      isDirty: filePath === null,
      lastSavedAt: filePath ? new Date().toISOString() : null,
      lastArchiveBytes: archiveBytes,
      lastMsgpackBytes: msgpackBytes,
    });
    void syncWindowTitle(doc.name, filePath === null);

    if (filePath) {
      const entry = toRecentEntry({ filePath, doc, commitCount, headCommitId });
      const filtered = get().recentProjects.filter((p) => p.filePath !== filePath);
      const updated = [entry, ...filtered].slice(0, 16);
      set({ recentProjects: updated });
      await saveRecentProjects(updated).catch(() => undefined);
    }
  },

  markSaved: async ({
    filePath,
    doc,
    archiveBytes,
    msgpackBytes,
    commitCount,
    headCommitId,
  }) => {
    const now = new Date().toISOString();
    set({
      hasOpenProject: true,
      filePath,
      isDirty: false,
      lastSavedAt: now,
      lastArchiveBytes: archiveBytes,
      lastMsgpackBytes: msgpackBytes,
    });
    void syncWindowTitle(doc.name, false);

    const entry = toRecentEntry({ filePath, doc, commitCount, headCommitId });
    const filtered = get().recentProjects.filter((p) => p.filePath !== filePath);
    const updated = [entry, ...filtered].slice(0, 16);
    set({ recentProjects: updated });
    await saveRecentProjects(updated).catch(() => undefined);
  },

  setDirty: (dirty, projectName) => {
    set({ isDirty: dirty });
    if (projectName) {
      void syncWindowTitle(projectName, dirty);
    }
  },

  closeProject: () => {
    set({
      hasOpenProject: false,
      filePath: null,
      isDirty: false,
      lastSavedAt: null,
      lastArchiveBytes: null,
      lastMsgpackBytes: null,
    });
    void syncWindowTitle(undefined, false);
  },

  refreshRecentProjects: async () => {
    const list = await loadRecentProjects();
    set({ recentProjects: list });
  },

  removeRecentProject: async (filePath) => {
    const updated = get().recentProjects.filter((p) => p.filePath !== filePath);
    set({ recentProjects: updated });
    await saveRecentProjects(updated).catch(() => undefined);
  },
}));
