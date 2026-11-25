import { create } from "zustand";
import { createStableId } from "@/domain/protocol/naming";
import type {
  MkuiDocument,
  VersionCommitEntry,
  VersionIndex,
} from "@/domain/protocol/types";
import {
  commitVersionToArchive,
  exportCommitToMkuiWithDialog,
  listVersionsInArchive,
  loadCommitSnapshot,
} from "@/services/versionService";
import { isTauriRuntime } from "@/services/tauriBridge";

/**
 * 工程版本控制 Store
 * 兼容已保存至 .mkui 的版本读写与未落盘草稿的内存快照暂存（首次保存时一并打包入 .mkui）
 */

interface VersionState {
  index: VersionIndex;
  /** 内存草稿快照缓存（仅在尚未保存为 .mkui 或浏览器预览时使用） */
  memorySnapshots: Record<string, MkuiDocument>;
  selectedCompareCommitId: string | null;
  compareDocument: MkuiDocument | null;
  isBusy: boolean;

  setVersionHistory: (index: VersionIndex) => void;
  resetHistory: () => void;
  selectCompareCommit: (
    commitId: string | null,
    filePath: string | null,
  ) => Promise<void>;
  commitSnapshot: (params: {
    filePath: string | null;
    document: MkuiDocument;
    message: string;
    versionTag?: string;
    author: string;
  }) => Promise<VersionIndex>;
  loadSnapshotDoc: (
    filePath: string | null,
    commitId: string,
  ) => Promise<MkuiDocument>;
  exportSnapshotAsMkui: (
    filePath: string | null,
    commitId: string,
    projectName: string,
  ) => Promise<string | null>;
  refreshFromArchive: (filePath: string) => Promise<void>;
}

function countStats(doc: MkuiDocument) {
  let graphicCount = 0;
  let textCount = 0;
  for (const f of doc.frames) {
    graphicCount += f.graphics.length;
    textCount += f.graphics.filter((g) => g.kind === "text").length;
  }
  return { frameCount: doc.frames.length, graphicCount, textCount };
}

export const useVersionStore = create<VersionState>((set, get) => ({
  index: { headCommitId: null, commits: [] },
  memorySnapshots: {},
  selectedCompareCommitId: null,
  compareDocument: null,
  isBusy: false,

  setVersionHistory: (index) =>
    set({
      index,
      selectedCompareCommitId: null,
      compareDocument: null,
    }),

  resetHistory: () =>
    set({
      index: { headCommitId: null, commits: [] },
      memorySnapshots: {},
      selectedCompareCommitId: null,
      compareDocument: null,
    }),

  refreshFromArchive: async (filePath) => {
    if (!isTauriRuntime()) {
      return;
    }
    const index = await listVersionsInArchive(filePath);
    set({ index });
  },

  selectCompareCommit: async (commitId, filePath) => {
    if (!commitId) {
      set({ selectedCompareCommitId: null, compareDocument: null });
      return;
    }
    set({ selectedCompareCommitId: commitId, isBusy: true });
    try {
      const doc = await get().loadSnapshotDoc(filePath, commitId);
      set({ compareDocument: doc, isBusy: false });
    } catch {
      set({ compareDocument: null, isBusy: false });
    }
  },

  commitSnapshot: async ({ filePath, document, message, versionTag, author }) => {
    set({ isBusy: true });
    try {
      if (filePath && isTauriRuntime()) {
        const nextIndex = await commitVersionToArchive({
          filePath,
          document,
          message,
          versionTag,
          author,
        });
        set({ index: nextIndex, isBusy: false });
        return nextIndex;
      }

      // 内存暂存模式（未保存过的新工程或浏览器预览模式）
      const commitId = createStableId("c");
      const stats = countStats(document);
      const entry: VersionCommitEntry = {
        commitId,
        parentId: get().index.headCommitId,
        versionTag: versionTag?.trim() ? versionTag.trim() : null,
        message: message.trim() || "保存版本快照",
        author: author.trim() || "Designer",
        createdAt: new Date().toISOString(),
        sha256: `mem_${Math.random().toString(16).slice(2, 10)}`,
        ...stats,
      };
      const nextIndex: VersionIndex = {
        headCommitId: commitId,
        commits: [...get().index.commits, entry],
      };
      set((s) => ({
        index: nextIndex,
        memorySnapshots: {
          ...s.memorySnapshots,
          [commitId]: structuredClone(document),
        },
        isBusy: false,
      }));
      return nextIndex;
    } catch (err) {
      set({ isBusy: false });
      throw err;
    }
  },

  loadSnapshotDoc: async (filePath, commitId) => {
    const cached = get().memorySnapshots[commitId];
    if (cached) {
      return structuredClone(cached);
    }
    if (filePath && isTauriRuntime()) {
      return loadCommitSnapshot(filePath, commitId);
    }
    throw new Error(`未找到提交快照 ${commitId}`);
  },

  exportSnapshotAsMkui: async (filePath, commitId, projectName) => {
    if (!filePath || !isTauriRuntime()) {
      throw new Error("请先将工程保存为 .mkui 后再导出历史版本");
    }
    return exportCommitToMkuiWithDialog(filePath, commitId, projectName);
  },
}));
