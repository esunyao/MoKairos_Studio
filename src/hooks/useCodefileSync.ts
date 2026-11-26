import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import type { CodeNodeUpsertSpec } from "@/domain/codegen/types";
import { useCodegenStore } from "@/stores/useCodegenStore";

/**
 * 代码文件保存与 React Flow 代码节点双向同步 Hook
 */

export function useCodefileSync() {
  const updateCodeFile = useCodegenStore((s) => s.updateCodeFile);
  const upsertCodeNode = useCodegenStore((s) => s.upsertCodeNode);

  const saveAndSyncCodeFile = useCallback(
    async (path: string, content: string) => {
      try {
        await updateCodeFile(path, content, true);
        const parsed = useCodegenStore.getState().parsedFiles[path];
        const wireableCount = parsed?.functions.filter((f) => f.wireable).length ?? 0;
        toast.success(`已保存并同步代码文件 code/${path}`, {
          description: `识别 ${parsed?.functions.length ?? 0} 个函数（${wireableCount} 个可作为节点连线）`,
        });
      } catch (err) {
        toast.error(`保存 code/${path} 失败`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [updateCodeFile],
  );

  const syncCodeNodeToFile = useCallback(
    async (spec: CodeNodeUpsertSpec, targetFile = "nodes.c") => {
      try {
        const fnInfo = await upsertCodeNode(targetFile, spec);
        toast.success(`代码节点「${spec.name}」已写入 code/${targetFile}`, {
          description: "画布节点端口与 C 源码已同步更新",
        });
        return fnInfo;
      } catch (err) {
        toast.error(`代码节点「${spec.name}」同步失败`, {
          description: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    [upsertCodeNode],
  );

  return { saveAndSyncCodeFile, syncCodeNodeToFile };
}
