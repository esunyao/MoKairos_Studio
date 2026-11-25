import { describe, expect, it } from "vitest";
import { createDocumentFromTemplate } from "@/domain/templates/starterTemplates";
import { computeDocumentDiff } from "@/domain/versioning/diffEngine";

describe("版本控制结构化 Diff 引擎", () => {
  it("应准确识别新增、删除与属性修改的图元", () => {
    const base = createDocumentFromTemplate("minimal_reticle", "diff_demo", "infantry_3");
    const next = structuredClone(base);

    // 修改第一个图元线宽
    next.frames[0].graphics[0].lineWidth = 4;
    // 删除第二个图元
    next.frames[0].graphics.splice(1, 1);
    // 新增一个字符图元
    next.frames[0].graphics.push({
      id: "g_new_txt",
      figureName: "n01",
      displayName: "新增提示",
      groupId: next.frames[0].groups[0].id,
      layer: 5,
      color: 1,
      lineWidth: 2,
      dynamic: true,
      visible: true,
      locked: false,
      kind: "text",
      x: 300,
      y: 700,
      fontSize: 20,
      text: "BOOST",
    });

    const diff = computeDocumentDiff(base, next);
    expect(diff.modifiedCount).toBe(1);
    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(1);

    const modItem = diff.graphicDiffs.find((d) => d.kind === "modified");
    expect(modItem?.changes.some((c) => c.field === "lineWidth" && c.after === "4")).toBe(true);
  });
});
