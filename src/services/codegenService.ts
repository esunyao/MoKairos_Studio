import { invokeCommand, isTauriRuntime } from "./tauriBridge";
import {
  BUILTIN_PRESETS_FALLBACK,
  parseCFileFallback,
  upsertCodeNodeFallback,
  validateProfileLightweight,
} from "@/domain/codegen/profileSerializer";
import type { MkuiDocument } from "@/domain/protocol/types";
import type {
  CodegenBundle,
  CodegenDiagnostic,
  CodegenPresetInfo,
  CodegenPreviewResult,
  CodegenProfile,
  CodeNodeUpsertResult,
  CodeNodeUpsertSpec,
  ExportCmakeResult,
  ExportSourcesResult,
  ParsedCodeFile,
} from "@/domain/codegen/types";

/**
 * 代码生成与 CMake 导出 Tauri IPC 服务封装
 */

export async function loadCodegenPresets(): Promise<CodegenPresetInfo[]> {
  if (!isTauriRuntime()) {
    return BUILTIN_PRESETS_FALLBACK;
  }
  return invokeCommand<CodegenPresetInfo[]>("codegen_load_presets");
}

export async function parseCodegenProfile(profileToml: string): Promise<CodegenProfile | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<CodegenProfile>("codegen_parse_profile", { profileToml });
}

export async function loadBuiltinBaseLib(): Promise<Record<string, string>> {
  if (!isTauriRuntime()) {
    return {};
  }
  return invokeCommand<Record<string, string>>("codegen_load_builtin_base_lib");
}

export async function validateCodegenProfile(
  profileToml: string,
  document: MkuiDocument,
  codeFiles: Record<string, string>,
): Promise<CodegenDiagnostic[]> {
  if (!isTauriRuntime()) {
    void profileToml;
    void document;
    void codeFiles;
    return validateProfileLightweight(BUILTIN_PRESETS_FALLBACK[0].profile);
  }
  return invokeCommand<CodegenDiagnostic[]>("codegen_validate_profile", {
    profileToml,
    document,
    codeFiles,
  });
}

export async function previewCodegenProject(
  document: MkuiDocument,
  codegen: CodegenBundle,
  mkuiName?: string,
): Promise<CodegenPreviewResult> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式无法执行 Rust 代码生成器，请在 Tauri 桌面端运行。");
  }
  return invokeCommand<CodegenPreviewResult>("codegen_preview", {
    document,
    codegen,
    mkuiName,
  });
}

export async function parseCodegenFile(
  path: string,
  content: string,
  prefix: string,
): Promise<ParsedCodeFile> {
  if (!isTauriRuntime()) {
    return parseCFileFallback(path, content, prefix);
  }
  return invokeCommand<ParsedCodeFile>("codegen_parse_codefile", {
    path,
    content,
    prefix,
  });
}

export async function upsertCodeNodeFunction(
  path: string,
  content: string,
  prefix: string,
  spec: CodeNodeUpsertSpec,
): Promise<CodeNodeUpsertResult> {
  if (!isTauriRuntime()) {
    return upsertCodeNodeFallback(path, content, prefix, spec);
  }
  return invokeCommand<CodeNodeUpsertResult>("codegen_upsert_code_node", {
    path,
    content,
    prefix,
    spec,
  });
}

export async function exportCmakeModule(params: {
  targetDir: string;
  mkuiFileName: string;
  prefix: string;
  version?: string;
  baseUrl?: string;
}): Promise<ExportCmakeResult> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式不支持写入本地 CMake 文件，请在 Tauri 桌面端运行。");
  }
  return invokeCommand<ExportCmakeResult>("codegen_export_cmake", params);
}

export async function exportGeneratedSources(params: {
  document: MkuiDocument;
  codegen: CodegenBundle;
  targetDir: string;
  includeCustomScaffold: boolean;
  mkuiName?: string;
}): Promise<ExportSourcesResult> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式不支持导出本地源码目录，请在 Tauri 桌面端运行。");
  }
  return invokeCommand<ExportSourcesResult>("codegen_export_sources", params);
}
