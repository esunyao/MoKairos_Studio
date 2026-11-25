import {
  getRobotRoleMeta,
  PACKET_TOTAL_BYTES,
  RM_PROTOCOL_LIMITS,
  type RobotRole2027,
} from "./constants";
import type {
  GroupPacketSlice,
  MkuiFrame,
  PacketBudgetReport,
} from "./types";

/**
 * 裁判系统 0x0301 UI 协议拆包与串口带宽预算计算器
 * 规则：
 * 1. 每个字符图元（text）必须独占 1 帧 0x0110（60 B）。
 * 2. 其余 7 类图形按分组打包，每包最多 7 个：
 *    1 -> 0x0101 (30 B), 2 -> 0x0102 (45 B), 3..5 -> 0x0103 (90 B), 6..7 -> 0x0104 (120 B)。
 */

function chooseShapeSubPacket(count: number): {
  subCmdId: 0x0101 | 0x0102 | 0x0103 | 0x0104;
  packetBytes: number;
} {
  if (count <= 1) {
    return { subCmdId: 0x0101, packetBytes: PACKET_TOTAL_BYTES.graphic1 };
  }
  if (count === 2) {
    return { subCmdId: 0x0102, packetBytes: PACKET_TOTAL_BYTES.graphic2 };
  }
  if (count <= 5) {
    return { subCmdId: 0x0103, packetBytes: PACKET_TOTAL_BYTES.graphic5 };
  }
  return { subCmdId: 0x0104, packetBytes: PACKET_TOTAL_BYTES.graphic7 };
}

export function calculatePacketBudget(
  frame: MkuiFrame,
  robotRole: RobotRole2027,
): PacketBudgetReport {
  const groupNameMap = new Map(frame.groups.map((g) => [g.id, g.name]));
  const grouped = new Map<string, MkuiFrame["graphics"]>();

  for (const graphic of frame.graphics) {
    const list = grouped.get(graphic.groupId);
    if (list) {
      list.push(graphic);
    } else {
      grouped.set(graphic.groupId, [graphic]);
    }
  }

  const slices: GroupPacketSlice[] = [];
  let charPacketCount = 0;
  let graphicPacketCount = 0;
  let fullRefreshBytes = 0;
  let dynamicRefreshBytes = 0;

  for (const [groupId, items] of grouped.entries()) {
    const groupName = groupNameMap.get(groupId) ?? "未分组";

    // 字符图元各自独占 0x0110 帧
    const textItems = items.filter((item) => item.kind === "text");
    for (const txt of textItems) {
      charPacketCount += 1;
      fullRefreshBytes += PACKET_TOTAL_BYTES.character;
      if (txt.dynamic) {
        dynamicRefreshBytes += PACKET_TOTAL_BYTES.character;
      }
      slices.push({
        groupId,
        groupName,
        subCmdId: 0x0110,
        itemCount: 1,
        packetBytes: PACKET_TOTAL_BYTES.character,
        dynamicCount: txt.dynamic ? 1 : 0,
      });
    }

    // 非字符图元按 7 个贪心拆包
    const shapeItems = items.filter((item) => item.kind !== "text");
    for (let i = 0; i < shapeItems.length; i += 7) {
      const chunk = shapeItems.slice(i, i + 7);
      const { subCmdId, packetBytes } = chooseShapeSubPacket(chunk.length);
      const dynCount = chunk.filter((c) => c.dynamic).length;
      graphicPacketCount += 1;
      fullRefreshBytes += packetBytes;
      if (dynCount > 0) {
        // 动态刷新时只发送包含动态图元的包
        const dynSlice = chooseShapeSubPacket(dynCount);
        dynamicRefreshBytes += dynSlice.packetBytes;
      }
      slices.push({
        groupId,
        groupName,
        subCmdId,
        itemCount: chunk.length,
        packetBytes,
        dynamicCount: dynCount,
      });
    }
  }

  const totalGraphics = frame.graphics.length;
  const textCount = charPacketCount;
  const shapeCount = totalGraphics - textCount;
  const dynamicCount = frame.graphics.filter((g) => g.dynamic).length;
  const totalPacketCount = graphicPacketCount + charPacketCount;

  const bandwidthLimitBytesPerSec = getRobotRoleMeta(robotRole).bandwidthLimitBytesPerSec;
  const activeBytesPerRound = dynamicRefreshBytes > 0 ? dynamicRefreshBytes : fullRefreshBytes;
  const bytesSafeHz =
    activeBytesPerRound > 0
      ? Math.floor(bandwidthLimitBytesPerSec / activeBytesPerRound)
      : RM_PROTOCOL_LIMITS.maxCommandHz;
  const packetSafeHz =
    totalPacketCount > 0
      ? Math.floor(RM_PROTOCOL_LIMITS.maxCommandHz / Math.max(1, slices.filter((s) => s.dynamicCount > 0).length || totalPacketCount))
      : RM_PROTOCOL_LIMITS.maxCommandHz;
  const estimatedRefreshHz = Math.min(
    RM_PROTOCOL_LIMITS.maxCommandHz,
    bytesSafeHz,
    Math.max(1, packetSafeHz),
  );
  const bandwidthRatioAt10Hz =
    activeBytesPerRound > 0
      ? (activeBytesPerRound * 10) / bandwidthLimitBytesPerSec
      : 0;

  return {
    frameId: frame.id,
    frameName: frame.name,
    totalGraphics,
    shapeCount,
    textCount,
    dynamicCount,
    graphicPacketCount,
    charPacketCount,
    totalPacketCount,
    fullRefreshBytes,
    dynamicRefreshBytes,
    bandwidthLimitBytesPerSec,
    estimatedRefreshHz,
    bandwidthRatioAt10Hz,
    slices,
  };
}
