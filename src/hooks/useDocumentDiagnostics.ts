import { useMemo } from "react";
import { calculatePacketBudget } from "@/domain/protocol/packetBudget";
import { preflightFrame } from "@/domain/protocol/preflight";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 派生当前激活画面的协议预检结果与串口带宽预算
 */

export function useDocumentDiagnostics() {
  const doc = useDocumentStore((s) => s.doc);

  const activeFrame = useMemo(
    () => doc.frames.find((f) => f.id === doc.activeFrameId) ?? doc.frames[0],
    [doc.frames, doc.activeFrameId],
  );

  const budget = useMemo(
    () => calculatePacketBudget(activeFrame, doc.robotRole),
    [activeFrame, doc.robotRole],
  );

  const issues = useMemo(
    () => preflightFrame(activeFrame, doc.robotRole),
    [activeFrame, doc.robotRole],
  );

  const errorCount = useMemo(
    () => issues.filter((i) => i.severity === "error").length,
    [issues],
  );

  const warningCount = useMemo(
    () => issues.filter((i) => i.severity === "warn").length,
    [issues],
  );

  return {
    activeFrame,
    budget,
    issues,
    errorCount,
    warningCount,
  };
}
