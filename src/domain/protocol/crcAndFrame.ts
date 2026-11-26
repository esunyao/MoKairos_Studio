import {
  GRAPHIC_KIND_MAP,
  RM_PROTOCOL_LIMITS,
} from "./constants";
import { clampInt } from "./geometry";
import type { MkuiFrame, MkuiGraphic, TextGraphic } from "./types";

/**
 * RoboMaster 裁判系统 0x0301 绘图协议 CRC8 / CRC16 与二进制帧封包工具
 * 用于模拟器实时报文检视、字节校验与协议调试
 */

const CRC8_INIT = 0xff;
const CRC8_TAB = new Uint8Array([
  0x00, 0x5e, 0xbc, 0xe2, 0x61, 0x3f, 0xdd, 0x83, 0xc2, 0x9c, 0x7e, 0x20, 0xa3, 0xfd, 0x1f, 0x41,
  0x9d, 0xc3, 0x21, 0x7f, 0xfc, 0xa2, 0x40, 0x1e, 0x5f, 0x01, 0xe3, 0xbd, 0x3e, 0x60, 0x82, 0xdc,
  0x23, 0x7d, 0x9f, 0xc1, 0x42, 0x1c, 0xfe, 0xa0, 0xe1, 0xbf, 0x5d, 0x03, 0x80, 0xde, 0x3c, 0x62,
  0xbe, 0xe0, 0x02, 0x5c, 0xdf, 0x81, 0x63, 0x3d, 0x7c, 0x22, 0xc0, 0x9e, 0x1d, 0x43, 0xa1, 0xff,
  0x46, 0x18, 0xfa, 0xa4, 0x27, 0x79, 0x9b, 0xc5, 0x84, 0xda, 0x38, 0x66, 0xe5, 0xbb, 0x59, 0x07,
  0xdb, 0x85, 0x67, 0x39, 0xba, 0xe4, 0x06, 0x58, 0x19, 0x47, 0xa5, 0xfb, 0x78, 0x26, 0xc4, 0x9a,
  0x65, 0x3b, 0xd9, 0x87, 0x04, 0x5a, 0xb8, 0xe6, 0xa7, 0xf9, 0x1b, 0x45, 0xc6, 0x98, 0x7a, 0x24,
  0xf8, 0xa6, 0x44, 0x1a, 0x99, 0xc7, 0x25, 0x7b, 0x3a, 0x64, 0x86, 0xd8, 0x5b, 0x05, 0xe7, 0xb9,
  0x8c, 0xd2, 0x30, 0x6e, 0xed, 0xb3, 0x51, 0x0f, 0x4e, 0x10, 0xf2, 0xac, 0x2f, 0x71, 0x93, 0xcd,
  0x11, 0x4f, 0xad, 0xf3, 0x70, 0x2e, 0xcc, 0x92, 0xd3, 0x8d, 0x6f, 0x31, 0xb2, 0xec, 0x0e, 0x50,
  0xaf, 0xf1, 0x13, 0x4d, 0xce, 0x90, 0x72, 0x2c, 0x6d, 0x33, 0xd1, 0x8f, 0x0c, 0x52, 0xb0, 0xee,
  0x32, 0x6c, 0x8e, 0xd0, 0x53, 0x0d, 0xef, 0xb1, 0xf0, 0xae, 0x4c, 0x12, 0x91, 0xcf, 0x2d, 0x73,
  0xca, 0x94, 0x76, 0x28, 0xab, 0xf5, 0x17, 0x49, 0x08, 0x56, 0xb4, 0xea, 0x69, 0x37, 0xd5, 0x8b,
  0x57, 0x09, 0xeb, 0xb5, 0x36, 0x68, 0x8a, 0xd4, 0x95, 0xcb, 0x29, 0x77, 0xf4, 0xaa, 0x48, 0x16,
  0xe9, 0xb7, 0x55, 0x0b, 0x88, 0xd6, 0x34, 0x6a, 0x2b, 0x75, 0x97, 0xc9, 0x4a, 0x14, 0xf6, 0xa8,
  0x74, 0x2a, 0xc8, 0x96, 0x15, 0x4b, 0xa9, 0xf7, 0xb6, 0xe8, 0x0a, 0x54, 0xd7, 0x89, 0x6b, 0x35,
]);

const CRC16_INIT = 0xffff;
const CRC16_TAB = new Uint16Array([
  0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf,
  0x8c48, 0x9dc1, 0xaf5a, 0xbed3, 0xca6c, 0xdbe5, 0xe97e, 0xf8f7,
  0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e,
  0x9cc9, 0x8d40, 0xbfdb, 0xae52, 0xdaed, 0xcb64, 0xf9ff, 0xe876,
  0x2102, 0x308b, 0x0210, 0x1399, 0x6726, 0x76af, 0x4434, 0x55bd,
  0xad4a, 0xbcc3, 0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5,
  0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c,
  0xbdcb, 0xac42, 0x9ed9, 0x8f50, 0xfbef, 0xea66, 0xd8fd, 0xc974,
  0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9, 0x2732, 0x36bb,
  0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3,
  0x5285, 0x430c, 0x7197, 0x601e, 0x14a1, 0x0528, 0x37b3, 0x263a,
  0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72,
  0x6306, 0x728f, 0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9,
  0xef4e, 0xfec7, 0xcc5c, 0xddd5, 0xa96a, 0xb8e3, 0x8a78, 0x9bf1,
  0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738,
  0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862, 0x9af9, 0x8b70,
  0x8408, 0x9581, 0xa71a, 0xb693, 0xc22c, 0xd3a5, 0xe13e, 0xf0b7,
  0x0840, 0x19c9, 0x2b52, 0x3adb, 0x4e64, 0x5fed, 0x6d76, 0x7cff,
  0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036,
  0x18c1, 0x0948, 0x3bd3, 0x2a5a, 0x5ee5, 0x4f6c, 0x7df7, 0x6c7e,
  0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5,
  0x2942, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd,
  0xb58b, 0xa402, 0x9699, 0x8710, 0xf3af, 0xe226, 0xd0bd, 0xc134,
  0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c,
  0xc60c, 0xd785, 0xe51e, 0xf497, 0x8028, 0x91a1, 0xa33a, 0xb2b3,
  0x4a44, 0x5bcd, 0x6956, 0x78df, 0x0c60, 0x1de9, 0x2f72, 0x3efb,
  0xd68d, 0xc704, 0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232,
  0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a,
  0xe70e, 0xf687, 0xc41c, 0xd595, 0xa12a, 0xb0a3, 0x8238, 0x93b1,
  0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb, 0x0e70, 0x1ff9,
  0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330,
  0x7bc7, 0x6a4e, 0x58d5, 0x495c, 0x3de3, 0x2c6a, 0x1ef1, 0x0f78,
]);

const textEncoder = new TextEncoder();

export function calcCrc8(data: Uint8Array): number {
  let crc = CRC8_INIT;
  for (let i = 0; i < data.length; i++) {
    crc = CRC8_TAB[(crc ^ data[i]) & 0xff];
  }
  return crc;
}

export function calcCrc16(data: Uint8Array): number {
  let crc = CRC16_INIT;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc >>> 8) ^ CRC16_TAB[(crc ^ data[i]) & 0xff]) & 0xffff;
  }
  return crc;
}

/** 图形操作类型：1=增加，2=修改，3=删除 */
export type GraphicOperateType = 1 | 2 | 3;

/** 将单个图元编码为 15 字节 interaction_figure_t */
export function encodeInteractionFigure(
  graphic: MkuiGraphic,
  operate: GraphicOperateType,
): Uint8Array {
  const out = new Uint8Array(15);
  const view = new DataView(out.buffer);

  // 1. figure_name[3]
  const nameBytes = textEncoder.encode(graphic.figureName);
  for (let i = 0; i < 3; i++) {
    out[i] = nameBytes[i] ?? 0;
  }

  const figureType = GRAPHIC_KIND_MAP[graphic.kind].protocolCode & 0x7;
  let detailsA = 0;
  let detailsB = 0;
  let startX = 0;
  let startY = 0;
  let detailsC = 0;
  let detailsD = 0;
  let detailsE = 0;
  let int32Payload: number | null = null;

  switch (graphic.kind) {
    case "line":
    case "rect":
      startX = graphic.startX;
      startY = graphic.startY;
      detailsD = graphic.endX;
      detailsE = graphic.endY;
      break;
    case "circle":
      startX = graphic.centerX;
      startY = graphic.centerY;
      detailsC = graphic.radius;
      break;
    case "ellipse":
      startX = graphic.centerX;
      startY = graphic.centerY;
      detailsD = graphic.rx;
      detailsE = graphic.ry;
      break;
    case "arc":
      startX = graphic.centerX;
      startY = graphic.centerY;
      detailsA = graphic.startAngle;
      detailsB = graphic.endAngle;
      detailsD = graphic.rx;
      detailsE = graphic.ry;
      break;
    case "float":
      startX = graphic.x;
      startY = graphic.y;
      detailsA = graphic.fontSize;
      int32Payload = clampInt(
        Math.round(graphic.value * RM_PROTOCOL_LIMITS.floatScaleFactor),
        RM_PROTOCOL_LIMITS.int32Min,
        RM_PROTOCOL_LIMITS.int32Max,
      );
      break;
    case "int":
      startX = graphic.x;
      startY = graphic.y;
      detailsA = graphic.fontSize;
      int32Payload = clampInt(
        graphic.value,
        RM_PROTOCOL_LIMITS.int32Min,
        RM_PROTOCOL_LIMITS.int32Max,
      );
      break;
    case "text":
      startX = graphic.x;
      startY = graphic.y;
      detailsA = graphic.fontSize;
      detailsB = Math.min(30, textEncoder.encode(graphic.text).length);
      break;
  }

  const word1 =
    ((operate & 0x7) |
      ((figureType & 0x7) << 3) |
      ((graphic.layer & 0xf) << 6) |
      ((graphic.color & 0xf) << 10) |
      ((detailsA & 0x1ff) << 14) |
      ((detailsB & 0x1ff) << 23)) >>>
    0;

  const word2 =
    ((graphic.lineWidth & 0x3ff) |
      ((startX & 0x7ff) << 10) |
      ((startY & 0x7ff) << 21)) >>>
    0;

  view.setUint32(3, word1, true);
  view.setUint32(7, word2, true);

  if (int32Payload !== null) {
    view.setInt32(11, int32Payload, true);
  } else {
    const word3 =
      ((detailsC & 0x3ff) |
        ((detailsD & 0x7ff) << 10) |
        ((detailsE & 0x7ff) << 21)) >>>
      0;
    view.setUint32(11, word3, true);
  }

  return out;
}

export interface EncodedProtocolPacket {
  id: string;
  timestamp: string;
  direction: "TX" | "RX";
  cmdId: number;
  subCmdId: 0x0101 | 0x0102 | 0x0103 | 0x0104 | 0x0110;
  senderId: number;
  receiverId: number;
  itemCount: number;
  totalBytes: number;
  crcValid: boolean;
  summary: string;
  rawBytes: Uint8Array;
}

/** 构造完整 0x0301 裁判系统串口协议帧（含 frame_header + CRC8 + cmd_id + 交互头 + 内容 + CRC16） */
export function buildRefereeUiPacket(params: {
  subCmdId: 0x0101 | 0x0102 | 0x0103 | 0x0104 | 0x0110;
  senderId: number;
  receiverId: number;
  seq: number;
  content: Uint8Array;
  direction?: "TX" | "RX";
  summary: string;
  itemCount: number;
}): EncodedProtocolPacket {
  const dataLength = 6 + params.content.length;
  const totalBytes = 5 + 2 + dataLength + 2;
  const frame = new Uint8Array(totalBytes);
  const view = new DataView(frame.buffer);

  // frame_header (5 bytes)
  frame[0] = 0xa5;
  view.setUint16(1, dataLength, true);
  frame[3] = params.seq & 0xff;
  frame[4] = calcCrc8(frame.subarray(0, 4));

  // cmd_id = 0x0301
  view.setUint16(5, 0x0301, true);

  // robot_interaction_data_t header (6 bytes)
  view.setUint16(7, params.subCmdId, true);
  view.setUint16(9, params.senderId, true);
  view.setUint16(11, params.receiverId, true);

  // content
  frame.set(params.content, 13);

  // frame_tail CRC16
  const crc16 = calcCrc16(frame.subarray(0, totalBytes - 2));
  view.setUint16(totalBytes - 2, crc16, true);

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(
    now.getMilliseconds(),
  ).padStart(3, "0")}`;

  return {
    id: `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: timeStr,
    direction: params.direction ?? "TX",
    cmdId: 0x0301,
    subCmdId: params.subCmdId,
    senderId: params.senderId,
    receiverId: params.receiverId,
    itemCount: params.itemCount,
    totalBytes,
    crcValid: verifyRefereeFrame(frame),
    summary: params.summary,
    rawBytes: frame,
  };
}

/** 校验整帧 CRC8 与 CRC16 是否有效 */
export function verifyRefereeFrame(frame: Uint8Array): boolean {
  if (frame.length < 9 || frame[0] !== 0xa5) {
    return false;
  }
  const dataLen = frame[1] | (frame[2] << 8);
  if (frame.length !== 5 + 2 + dataLen + 2) {
    return false;
  }
  if (calcCrc8(frame.subarray(0, 4)) !== frame[4]) {
    return false;
  }
  const expectedCrc16 =
    frame[frame.length - 2] | (frame[frame.length - 1] << 8);
  return calcCrc16(frame.subarray(0, frame.length - 2)) === expectedCrc16;
}

/** 将 Frame 内全部（或仅动态）图元按组拆包并编码为协议帧数组（与 packetBudget 及 Rust 编码器对齐） */
export function encodeFramePackets(params: {
  frame: MkuiFrame;
  senderId: number;
  receiverId: number;
  operate: GraphicOperateType;
  onlyDynamic?: boolean;
  startSeq?: number;
  direction?: "TX" | "RX";
}): EncodedProtocolPacket[] {
  const packets: EncodedProtocolPacket[] = [];
  let seq = params.startSeq ?? 0;

  const candidates = params.onlyDynamic
    ? params.frame.graphics.filter((g) => g.dynamic)
    : params.frame.graphics;

  const grouped = new Map<string, MkuiGraphic[]>();
  for (const grp of params.frame.groups) {
    grouped.set(grp.id, []);
  }
  for (const g of candidates) {
    const bucket = grouped.get(g.groupId);
    if (bucket) {
      bucket.push(g);
    } else {
      grouped.set(g.groupId, [g]);
    }
  }

  for (const items of grouped.values()) {
    if (items.length === 0) continue;

    const textGraphics = items.filter(
      (g): g is TextGraphic => g.kind === "text",
    );
    for (const txt of textGraphics) {
      const content = new Uint8Array(45);
      content.set(encodeInteractionFigure(txt, params.operate), 0);
      const encodedStr = textEncoder.encode(txt.text).slice(0, 30);
      content.set(encodedStr, 15);
      packets.push(
        buildRefereeUiPacket({
          subCmdId: 0x0110,
          senderId: params.senderId,
          receiverId: params.receiverId,
          seq: seq++,
          content,
          direction: params.direction,
          itemCount: 1,
          summary: `字符 [${txt.figureName}] "${txt.text.slice(0, 12)}"`,
        }),
      );
    }

    const shapes = items.filter((g) => g.kind !== "text");
    for (let i = 0; i < shapes.length; i += 7) {
      const chunk = shapes.slice(i, i + 7);
      let slotCount: 1 | 2 | 5 | 7 = 7;
      let subCmdId: 0x0101 | 0x0102 | 0x0103 | 0x0104 = 0x0104;
      if (chunk.length === 1) {
        slotCount = 1;
        subCmdId = 0x0101;
      } else if (chunk.length === 2) {
        slotCount = 2;
        subCmdId = 0x0102;
      } else if (chunk.length <= 5) {
        slotCount = 5;
        subCmdId = 0x0103;
      }

      const content = new Uint8Array(slotCount * 15);
      for (let j = 0; j < chunk.length; j++) {
        content.set(encodeInteractionFigure(chunk[j], params.operate), j * 15);
      }

      packets.push(
        buildRefereeUiPacket({
          subCmdId,
          senderId: params.senderId,
          receiverId: params.receiverId,
          seq: seq++,
          content,
          direction: params.direction,
          itemCount: chunk.length,
          summary: `${chunk.length} 个图形 (${chunk
            .map((item) => item.figureName)
            .join(", ")})`,
        }),
      );
    }
  }

  return packets;
}

/** 格式化字节数组为 Hex 字符串 */
export function formatHexBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}
