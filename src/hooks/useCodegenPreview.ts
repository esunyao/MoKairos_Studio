import { useEffect, useState } from "react";
import { validateProfileLightweight } from "@/domain/codegen/profileSerializer";
import { preflightDocument } from "@/domain/protocol/preflight";
import { previewCodegenProject, validateCodegenProfile } from "@/services/codegenService";
import { isTauriRuntime } from "@/services/tauriBridge";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";

/**
 * 防抖代码生成预览与统一诊断刷新 Hook
 */

export function useCodegenPreview() {
  const doc = useDocumentStore((s) => s.doc);
  const filePath = useProjectStore((s) => s.filePath);
  const profileToml = useCodegenStore((s) => s.profileToml);
  const codeFiles = useCodegenStore((s) => s.codeFiles);
  const libOverrides = useCodegenStore((s) => s.libOverrides);
  const setPreviewResult = useCodegenStore((s) => s.setPreviewResult);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const mkuiName = filePath
        ? filePath.replace(/\\/g, "/").split("/").pop() || `${doc.name}.mkui`
        : `${doc.name || "design"}.mkui`;

      if (!isTauriRuntime()) {
        // 浏览器非桌面环境降级：联合前端协议预检与配置轻量校验
        const profile = useCodegenStore.getState().profile;
        const pre = preflightDocument(doc).map((issue) => ({
          severity: issue.severity,
          code: issue.code,
          location: issue.frameId ? `frame[${issue.frameId}]` : "",
          message: issue.message,
          detail: issue.detail,
          frameId: issue.frameId,
          graphicId: issue.graphicId,
        }));
        const profDiags = validateProfileLightweight(profile);
        if (!cancelled) {
          setPreviewResult(profile.prefix, {}, [...pre, ...profDiags]);
        }
        return;
      }

      setLoading(true);
      try {
        const res = await previewCodegenProject(
          doc,
          { profileToml, codeFiles, libOverrides },
          mkuiName,
        );
        if (!cancelled) {
          setPreviewResult(res.prefix, res.files, res.diagnostics);
        }
      } catch (err) {
        const fallbackDiags = await validateCodegenProfile(
          profileToml,
          doc,
          codeFiles,
        ).catch(() => []);
        if (!cancelled) {
          setPreviewResult(
            useCodegenStore.getState().profile.prefix,
            {},
            fallbackDiags.length > 0
              ? fallbackDiags
              : [
                  {
                    severity: "error",
                    code: "PREVIEW_ERROR",
                    location: "codegen/profile.toml",
                    message: err instanceof Error ? err.message : String(err),
                  },
                ],
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc, filePath, profileToml, codeFiles, libOverrides, setPreviewResult]);

  return { loading };
}
