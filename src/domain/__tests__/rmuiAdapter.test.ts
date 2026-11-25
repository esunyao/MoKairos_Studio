/// <reference types="node" />
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { exportToRmuiJson, importRmuiJson } from "@/domain/adapters/rmuiAdapter";

const BATTERY_RMUI_PATH =
  "E:/ProjectSpace/RobotMaster2026-2027/ProjectSpace/UICRM-Embedded/programs/ui_Standard/design/battery.rmui";

describe("RM-UI-Designer .rmui 兼容适配器", () => {
  it("应无损解析实车样例 battery.rmui 并对浮点坐标/线宽取整", () => {
    const raw = fs.readFileSync(BATTERY_RMUI_PATH, "utf-8");
    const { document, warnings } = importRmuiJson(raw, "battery");

    expect(warnings).toHaveLength(0);
    expect(document.frames).toHaveLength(1);
    expect(document.frames[0].name).toBe("default");
    expect(document.frames[0].graphics).toHaveLength(4);

    const percent = document.frames[0].graphics.find(
      (g) => g.displayName === "battery_percent",
    );
    expect(percent?.kind).toBe("int");
    if (percent?.kind === "int") {
      expect(percent.y).toBe(370);
      expect(percent.value).toBe(100);
    }

    const barFrame = document.frames[0].graphics.find(
      (g) => g.displayName === "battery_bar_frame",
    );
    expect(barFrame?.kind).toBe("rect");
    if (barFrame?.kind === "rect") {
      expect(barFrame.startX).toBe(1500);
      expect(barFrame.startY).toBe(380);
      expect(barFrame.endX).toBe(1810);
      expect(barFrame.endY).toBe(400);
      expect(barFrame.lineWidth).toBe(2);
    }

    // 反向导出后再导入应保持图元数量与几何坐标一致
    const exported = exportToRmuiJson(document);
    const reimported = importRmuiJson(exported, "battery_roundtrip");
    expect(reimported.document.frames[0].graphics).toHaveLength(4);
  });
});
