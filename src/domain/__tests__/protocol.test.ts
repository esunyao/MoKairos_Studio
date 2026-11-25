import { describe, expect, it } from "vitest";
import { deriveRobotAndClientIds } from "@/domain/protocol/constants";
import {
  encodeFramePackets,
  verifyRefereeFrame,
} from "@/domain/protocol/crcAndFrame";
import { allocateFigureName, getUtf8ByteLength } from "@/domain/protocol/naming";
import { calculatePacketBudget } from "@/domain/protocol/packetBudget";
import { preflightFrame } from "@/domain/protocol/preflight";
import { createDocumentFromTemplate } from "@/domain/templates/starterTemplates";
import type { MkuiFrame } from "@/domain/protocol/types";

describe("2027 裁判系统协议校验、分包与封帧", () => {
  it("应精确计算 UTF-8 字节数并在超过 30 字节时触发 Error 阻断", () => {
    const text11Zh = "步兵超级电容状态良好"; // 10汉字=30B
    expect(getUtf8ByteLength(text11Zh)).toBe(30);
    const overflowZh = "步兵超级电容状态非常好"; // 11汉字=33B
    expect(getUtf8ByteLength(overflowZh)).toBe(33);

    const frame: MkuiFrame = {
      id: "f1",
      name: "Main",
      groups: [{ id: "g1", name: "TextGrp", visible: true, locked: false, collapsed: false }],
      graphics: [
        {
          id: "t1",
          figureName: "t01",
          displayName: "中文超限测试",
          groupId: "g1",
          layer: 0,
          color: 1,
          lineWidth: 2,
          dynamic: true,
          visible: true,
          locked: false,
          kind: "text",
          x: 200,
          y: 800,
          fontSize: 20,
          text: overflowZh,
        },
      ],
    };

    const issues = preflightFrame(frame, "infantry_3");
    expect(issues.some((i) => i.severity === "error" && i.code === "TEXT_UTF8_OVERFLOW")).toBe(
      true,
    );
  });

  it("应检测重复的 3 字节 figureName 并能自动分配唯一短名", () => {
    const used = new Set<string>(["g01", "g02"]);
    const next = allocateFigureName(used);
    expect(next).toBe("g03");
    expect(getUtf8ByteLength(next)).toBeLessThanOrEqual(3);

    const doc = createDocumentFromTemplate("minimal_reticle", "dup_test", "infantry_4");
    doc.frames[0].graphics[1].figureName = doc.frames[0].graphics[0].figureName;
    const issues = preflightFrame(doc.frames[0], "infantry_4");
    expect(issues.some((i) => i.severity === "error" && i.code === "DUPLICATE_FIGURE_NAME")).toBe(
      true,
    );
  });

  it("应按 7/5/2/1 图形包与 60B 字符独占包准确预算数据包", () => {
    const doc = createDocumentFromTemplate("infantry_combat", "budget_test", "infantry_3");
    const budget = calculatePacketBudget(doc.frames[0], "infantry_3");
    // 模板含 10 个普通图形（分散在 4 组） + 2 个字符
    expect(budget.textCount).toBe(2);
    expect(budget.charPacketCount).toBe(2);
    expect(budget.shapeCount).toBe(10);
    expect(budget.totalPacketCount).toBe(budget.graphicPacketCount + budget.charPacketCount);
    expect(budget.bandwidthLimitBytesPerSec).toBe(3720);
  });

  it("应正确推导 2027 红蓝双方机器人 ID 与选手端 ID", () => {
    expect(deriveRobotAndClientIds("infantry_3", "red")).toEqual({
      robotId: 3,
      clientId: 0x0103,
      bandwidthLimit: 3720,
    });
    expect(deriveRobotAndClientIds("infantry_3", "blue")).toEqual({
      robotId: 103,
      clientId: 0x0167,
      bandwidthLimit: 3720,
    });
    expect(deriveRobotAndClientIds("heavy_1", "blue")).toEqual({
      robotId: 101,
      clientId: 0x0165,
      bandwidthLimit: 3720,
    });
    expect(deriveRobotAndClientIds("sentry_7", "red").clientId).toBeNull();
  });

  it("生成的 0x0301 协议帧应具备合法字节长度与 CRC8/CRC16 校验", () => {
    const doc = createDocumentFromTemplate("infantry_combat", "crc_test", "infantry_3");
    const packets = encodeFramePackets({
      frame: doc.frames[0],
      senderId: 3,
      receiverId: 0x0103,
      operate: 1,
    });
    expect(packets.length).toBeGreaterThan(0);
    for (const pkt of packets) {
      expect(pkt.crcValid).toBe(true);
      expect(verifyRefereeFrame(pkt.rawBytes)).toBe(true);
      if (pkt.subCmdId === 0x0110) {
        expect(pkt.totalBytes).toBe(60);
      } else {
        expect([30, 45, 90, 120]).toContain(pkt.totalBytes);
      }
    }
  });

  it("落入官方遮挡禁区的图元应触发 Safe Area 警告", () => {
    const frame: MkuiFrame = {
      id: "f_safe",
      name: "Main",
      groups: [{ id: "g1", name: "G", visible: true, locked: false, collapsed: false }],
      graphics: [
        {
          id: "bad1",
          figureName: "b01",
          displayName: "遮挡小地图框",
          groupId: "g1",
          layer: 0,
          color: 1,
          lineWidth: 2,
          dynamic: false,
          visible: true,
          locked: false,
          kind: "rect",
          startX: 1500,
          startY: 50,
          endX: 1700,
          endY: 200,
        },
      ],
    };
    const issues = preflightFrame(frame, "infantry_3");
    expect(issues.some((i) => i.severity === "warn" && i.code === "SAFE_AREA_COLLISION")).toBe(
      true,
    );
  });
});
