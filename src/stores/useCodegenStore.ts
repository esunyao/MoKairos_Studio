import { create } from "zustand";
import {
  createDefaultProfile,
  DEFAULT_GENERIC_C_TOML,
  serializeProfileToToml,
} from "@/domain/codegen/profileSerializer";
import type {
  CodeFunctionInfo,
  CodegenBundle,
  CodegenDiagnostic,
  CodegenPresetInfo,
  CodegenProfile,
  CodeNodeUpsertSpec,
  FlowGraph,
  ParsedCodeFile,
} from "@/domain/codegen/types";
import {
  loadBuiltinBaseLib,
  loadCodegenPresets,
  parseCodegenFile,
  parseCodegenProfile,
  upsertCodeNodeFunction,
} from "@/services/codegenService";

/**
 * 代码生成工作台状态切片（与当前工程生命周期绑定，同步打包入 .mkui codegen/*）
 */

export type CodegenSubTab = "wizard" | "nodes" | "code" | "export";

const DEFAULT_NODES_C = `/* 用户代码节点文件（与 React Flow 代码节点双向同步，零 USER CODE 标记） */
#include <stdint.h>

// 示例：将电压或百分比转换为显示文本或缩放值
float mk_scale_pct(float pct) {
    return pct * 100.0f;
}
`;

interface CodegenState {
  activeSubTab: CodegenSubTab;
  activeFlowId: string;
  profile: CodegenProfile;
  profileToml: string;
  codeFiles: Record<string, string>;
  libOverrides: Record<string, string>;
  parsedFiles: Record<string, ParsedCodeFile>;
  builtinPresets: CodegenPresetInfo[];
  builtinBaseTemplates: Record<string, string>;
  previewPrefix: string;
  previewFiles: Record<string, string>;
  previewDiagnostics: CodegenDiagnostic[];
  isDirty: boolean;

  setActiveSubTab: (tab: CodegenSubTab) => void;
  setActiveFlowId: (flowId: string) => void;
  bootstrapMetadata: () => Promise<void>;
  resetToDefault: () => void;
  loadFromArchive: (bundle?: CodegenBundle | null) => Promise<void>;
  toBundle: () => CodegenBundle;
  applyPreset: (preset: CodegenPresetInfo) => void;
  updateProfile: (updater: (prev: CodegenProfile) => CodegenProfile) => void;
  updateFlowGraph: (flowId: string, graph: FlowGraph) => void;
  mutateFlowGraph: (flowId: string, updater: (prev: FlowGraph) => FlowGraph) => void;
  ensureFlowExists: (flowId: string) => void;
  deleteFlowGraph: (flowId: string) => void;
  updateCodeFile: (path: string, content: string, syncAst?: boolean) => Promise<void>;
  deleteCodeFile: (path: string) => void;
  upsertCodeNode: (path: string, spec: CodeNodeUpsertSpec) => Promise<CodeFunctionInfo | null>;
  overrideBaseTemplate: (name: string, content: string) => void;
  resetBaseTemplate: (name: string) => void;
  setPreviewResult: (prefix: string, files: Record<string, string>, diagnostics: CodegenDiagnostic[]) => void;
  markSaved: () => void;
}

export const useCodegenStore = create<CodegenState>((set, get) => ({
  activeSubTab: "wizard",
  activeFlowId: "main",
  profile: createDefaultProfile(),
  profileToml: DEFAULT_GENERIC_C_TOML,
  codeFiles: { "nodes.c": DEFAULT_NODES_C },
  libOverrides: {},
  parsedFiles: {},
  builtinPresets: [],
  builtinBaseTemplates: {},
  previewPrefix: "mk_hud",
  previewFiles: {},
  previewDiagnostics: [],
  isDirty: false,

  setActiveSubTab: (tab) => set({ activeSubTab: tab }),
  setActiveFlowId: (flowId) => set({ activeFlowId: flowId }),

  bootstrapMetadata: async () => {
    const [presets, baseTemplates] = await Promise.all([
      loadCodegenPresets().catch(() => []),
      loadBuiltinBaseLib().catch(() => ({})),
    ]);
    set({ builtinPresets: presets, builtinBaseTemplates: baseTemplates });
    // 解析初始代码文件
    const state = get();
    const parsedEntries = await Promise.all(
      Object.entries(state.codeFiles).map(async ([p, c]) => [
        p,
        await parseCodegenFile(p, c, state.profile.prefix),
      ]),
    );
    set({ parsedFiles: Object.fromEntries(parsedEntries) });
  },

  resetToDefault: () => {
    const def = createDefaultProfile();
    set({
      profile: def,
      profileToml: DEFAULT_GENERIC_C_TOML,
      codeFiles: { "nodes.c": DEFAULT_NODES_C },
      libOverrides: {},
      parsedFiles: {},
      previewFiles: {},
      previewDiagnostics: [],
      activeFlowId: "main",
      isDirty: false,
    });
    void get().bootstrapMetadata();
  },

  loadFromArchive: async (bundle) => {
    if (!bundle || (!bundle.profileToml && Object.keys(bundle.codeFiles).length === 0)) {
      get().resetToDefault();
      return;
    }
    const state = get();
    let presets = state.builtinPresets;
    if (presets.length === 0) {
      presets = await loadCodegenPresets().catch(() => []);
    }
    let parsedProfile = createDefaultProfile();
    if (bundle.profileToml.trim()) {
      const fromRust = await parseCodegenProfile(bundle.profileToml).catch(() => null);
      if (fromRust) {
        parsedProfile = fromRust;
      }
    }

    const codeFiles =
      Object.keys(bundle.codeFiles).length > 0
        ? bundle.codeFiles
        : { "nodes.c": DEFAULT_NODES_C };
    const flowKeys = Object.keys(parsedProfile.flows ?? {});
    const parsedEntries = await Promise.all(
      Object.entries(codeFiles).map(async ([p, c]) => [
        p,
        await parseCodegenFile(p, c, parsedProfile.prefix),
      ]),
    );

    set({
      builtinPresets: presets,
      profile: parsedProfile,
      profileToml: bundle.profileToml || serializeProfileToToml(parsedProfile),
      codeFiles,
      libOverrides: bundle.libOverrides ?? {},
      parsedFiles: Object.fromEntries(parsedEntries),
      activeFlowId: flowKeys[0] ?? "main",
      isDirty: false,
    });
  },

  toBundle: () => {
    const s = get();
    return {
      profileToml: s.profileToml,
      codeFiles: s.codeFiles,
      libOverrides: s.libOverrides,
    };
  },

  applyPreset: (preset) => {
    const cloned = JSON.parse(JSON.stringify(preset.profile)) as CodegenProfile;
    const toml = serializeProfileToToml(cloned);
    set({
      profile: cloned,
      profileToml: toml,
      isDirty: true,
    });
  },

  updateProfile: (updater) => {
    set((s) => {
      const next = updater(s.profile);
      return {
        profile: next,
        profileToml: serializeProfileToToml(next),
        isDirty: true,
      };
    });
  },

  ensureFlowExists: (flowId) => {
    set((s) => {
      if (s.profile.flows[flowId]) {
        return { activeFlowId: flowId };
      }
      const ensuredFlows =
        Object.keys(s.profile.flows).length === 0
          ? { main: { nodes: [], edges: [] } }
          : s.profile.flows;
      const next: CodegenProfile = {
        ...s.profile,
        flows: {
          ...ensuredFlows,
          [flowId]: { nodes: [], edges: [] },
        },
      };
      return {
        profile: next,
        profileToml: serializeProfileToToml(next),
        activeFlowId: flowId,
        isDirty: true,
      };
    });
  },

  deleteFlowGraph: (flowId) => {
    set((s) => {
      const entries = Object.entries(s.profile.flows);
      if (entries.length <= 1) return s;
      const nextFlows: Record<string, FlowGraph> = {};
      for (const [k, v] of entries) {
        if (k !== flowId) nextFlows[k] = v;
      }
      const nextIds = Object.keys(nextFlows);
      const next: CodegenProfile = { ...s.profile, flows: nextFlows };
      return {
        profile: next,
        profileToml: serializeProfileToToml(next),
        activeFlowId: s.activeFlowId === flowId ? (nextIds[0] ?? "main") : s.activeFlowId,
        isDirty: true,
      };
    });
  },

  updateFlowGraph: (flowId, graph) => {
    set((s) => {
      const next: CodegenProfile = {
        ...s.profile,
        flows: {
          ...s.profile.flows,
          [flowId]: graph,
        },
      };
      return {
        profile: next,
        profileToml: serializeProfileToToml(next),
        isDirty: true,
      };
    });
  },

  mutateFlowGraph: (flowId, updater) => {
    set((s) => {
      const prevGraph = s.profile.flows[flowId] ?? { nodes: [], edges: [] };
      const nextGraph = updater(prevGraph);
      const next: CodegenProfile = {
        ...s.profile,
        flows: {
          ...s.profile.flows,
          [flowId]: nextGraph,
        },
      };
      return {
        profile: next,
        profileToml: serializeProfileToToml(next),
        isDirty: true,
      };
    });
  },

  updateCodeFile: async (path, content, syncAst = true) => {
    set((s) => ({
      codeFiles: { ...s.codeFiles, [path]: content },
      isDirty: true,
    }));
    if (syncAst) {
      const prefix = get().profile.prefix;
      const parsed = await parseCodegenFile(path, content, prefix);
      set((s) => ({
        parsedFiles: { ...s.parsedFiles, [path]: parsed },
      }));
    }
  },

  deleteCodeFile: (path) => {
    set((s) => {
      const nextFiles = { ...s.codeFiles };
      delete nextFiles[path];
      const nextParsed = { ...s.parsedFiles };
      delete nextParsed[path];
      return {
        codeFiles: nextFiles,
        parsedFiles: nextParsed,
        isDirty: true,
      };
    });
  },

  upsertCodeNode: async (path, spec) => {
    const state = get();
    const curContent = state.codeFiles[path] ?? "";
    const res = await upsertCodeNodeFunction(path, curContent, state.profile.prefix, spec);
    set((s) => ({
      codeFiles: { ...s.codeFiles, [path]: res.content },
      parsedFiles: { ...s.parsedFiles, [path]: res.parsed },
      isDirty: true,
    }));
    return res.parsed.functions.find((f) => f.name === spec.name) ?? null;
  },

  overrideBaseTemplate: (name, content) => {
    set((s) => ({
      libOverrides: { ...s.libOverrides, [name]: content },
      isDirty: true,
    }));
  },

  resetBaseTemplate: (name) => {
    set((s) => {
      const next = { ...s.libOverrides };
      delete next[name];
      return { libOverrides: next, isDirty: true };
    });
  },

  setPreviewResult: (prefix, files, diagnostics) =>
    set({ previewPrefix: prefix, previewFiles: files, previewDiagnostics: diagnostics }),

  markSaved: () => set({ isDirty: false }),
}));
