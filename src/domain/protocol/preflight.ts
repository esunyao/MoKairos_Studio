import {
  RM_CANVAS_HEIGHT,
  RM_CANVAS_WIDTH,
  RM_PROTOCOL_LIMITS,
  SAFE_AREA_ZONES,
} from "./constants";
import { getGraphicRmBoundingBox, type RmBoundingBox } from "./geometry";
import { getUtf8ByteLength, isValidCIdentifier, isValidFigureName } from "./naming";
import { calculatePacketBudget } from "./packetBudget";
import type { MkuiDocument, MkuiFrame, MkuiGraphic, PreflightIssue } from "./types";

/**
 * 2027 裁判系统协议预检引擎
 * 在导出、模拟或编辑提示阶段检查所有协议硬限制与官方遮挡禁区冲突
 */

function intersectsRect(a: RmBoundingBox, b: { x: number; y: number; width: number; height: number }): boolean {
  const bMaxX = b.x + b.width;
  const bMaxY = b.y + b.height;
  return a.minX < bMaxX && a.maxX > b.x && a.minY < bMaxY && a.maxY > b.y;
}

function intersectsCircle(box: RmBoundingBox, cx: number, cy: number, r: number): boolean {
  const nearestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const nearestY = Math.max(box.minY, Math.min(cy, box.maxY));
  const dx = nearestX - cx;
  const dy = nearestY - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 检查单个图元是否落入官方客户端 4 大遮挡禁区 */
export function detectSafeAreaCollisions(graphic: MkuiGraphic): string[] {
  const box = getGraphicRmBoundingBox(graphic);
  const hits: string[] = [];

  for (const zone of SAFE_AREA_ZONES) {
    if (zone.shape === "rect") {
      if (intersectsRect(box, zone)) {
        hits.push(zone.label);
      }
    } else if (intersectsCircle(box, zone.cx, zone.cy, zone.r)) {
      hits.push(zone.label);
    }
  }
  return hits;
}

/** 对单个 Frame 运行协议预检 */
export function preflightFrame(
  frame: MkuiFrame,
  robotRole: MkuiDocument["robotRole"],
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const seenFigureNames = new Map<string, string>();
  let issueIdx = 1;
  const nextId = () => `chk_${frame.id}_${issueIdx++}`;

  if (!frame.name.trim()) {
    issues.push({
      id: nextId(),
      severity: "error",
      code: "FRAME_NAME_EMPTY",
      message: "画面名称不能为空",
      frameId: frame.id,
    });
  }

  for (const g of frame.graphics) {
    // 1. figure_name[3] 合法性与唯一性
    if (!isValidFigureName(g.figureName)) {
      issues.push({
        id: nextId(),
        severity: "error",
        code: "INVALID_FIGURE_NAME",
        message: `图元「${g.displayName}」的协议短名 "${g.figureName}" 非法`,
        detail: `裁判系统 figure_name 必须为 1~3 字节（当前 ${getUtf8ByteLength(g.figureName)} B）`,
        frameId: frame.id,
        graphicId: g.id,
      });
    } else {
      const prevOwner = seenFigureNames.get(g.figureName);
      if (prevOwner) {
        issues.push({
          id: nextId(),
          severity: "error",
          code: "DUPLICATE_FIGURE_NAME",
          message: `协议短名 "${g.figureName}" 在画面「${frame.name}」内重复`,
          detail: `与图元「${prevOwner}」重名，实车发包时新图元会直接覆盖旧图元`,
          frameId: frame.id,
          graphicId: g.id,
        });
      } else {
        seenFigureNames.set(g.figureName, g.displayName);
      }
    }

    // 2. layer 0..9 校验
    if (
      !Number.isInteger(g.layer) ||
      g.layer < RM_PROTOCOL_LIMITS.minLayer ||
      g.layer > RM_PROTOCOL_LIMITS.maxLayer
    ) {
      issues.push({
        id: nextId(),
        severity: "error",
        code: "LAYER_OUT_OF_RANGE",
        message: `图元「${g.displayName}」图层 ${g.layer} 越界`,
        detail: "裁判系统仅支持 0 ~ 9 共 10 个图层",
        frameId: frame.id,
        graphicId: g.id,
      });
    }

    // 3. 线宽校验
    if (
      g.lineWidth < RM_PROTOCOL_LIMITS.minLineWidth ||
      g.lineWidth > RM_PROTOCOL_LIMITS.maxLineWidth
    ) {
      issues.push({
        id: nextId(),
        severity: "error",
        code: "LINE_WIDTH_OUT_OF_RANGE",
        message: `图元「${g.displayName}」线宽 ${g.lineWidth}px 超出位域范围 (1..1023)`,
        frameId: frame.id,
        graphicId: g.id,
      });
    } else if (g.lineWidth === 1 && g.kind !== "text" && g.kind !== "float" && g.kind !== "int") {
      issues.push({
        id: nextId(),
        severity: "warn",
        code: "THIN_LINE_WIDTH",
        message: `图元「${g.displayName}」线宽为 1px`,
        detail: "比赛图传压缩下 1px 细线容易发虚，主指示图形建议使用 2~4px",
        frameId: frame.id,
        graphicId: g.id,
      });
    }

    // 4. 字符 UTF-8 <= 30 字节
    if (g.kind === "text") {
      const byteLen = getUtf8ByteLength(g.text);
      if (byteLen > RM_PROTOCOL_LIMITS.maxTextUtf8Bytes) {
        issues.push({
          id: nextId(),
          severity: "error",
          code: "TEXT_UTF8_OVERFLOW",
          message: `文本图元「${g.displayName}」UTF-8 长度超限 (${byteLen} / 30 B)`,
          detail: "裁判系统字符帧 data[30] 上限为 30 UTF-8 字节（1 个中文约占 3 字节）",
          frameId: frame.id,
          graphicId: g.id,
        });
      }
    }

    // 5. 坐标范围检查
    const box = getGraphicRmBoundingBox(g);
    if (
      box.minX < 0 ||
      box.maxX > RM_CANVAS_WIDTH ||
      box.minY < 0 ||
      box.maxY > RM_CANVAS_HEIGHT
    ) {
      issues.push({
        id: nextId(),
        severity: "warn",
        code: "OUT_OF_VIEWPORT",
        message: `图元「${g.displayName}」部分超出 1920×1080 可视画板`,
        frameId: frame.id,
        graphicId: g.id,
      });
    }

    // 6. 变量键规范检查（面向未来 UICRM-Embedded 变量映射）
    if (g.varKey && !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(g.varKey)) {
      issues.push({
        id: nextId(),
        severity: "warn",
        code: "INVALID_VAR_KEY",
        message: `图元「${g.displayName}」绑定变量名 "${g.varKey}" 不符合标识符规范`,
        detail: "建议使用字母、数字、下划线或点号组合，例如 supercap.pct",
        frameId: frame.id,
        graphicId: g.id,
      });
    }

    // 7. Safe Area 遮挡禁区预警
    const safeHits = detectSafeAreaCollisions(g);
    if (safeHits.length > 0) {
      issues.push({
        id: nextId(),
        severity: "warn",
        code: "SAFE_AREA_COLLISION",
        message: `图元「${g.displayName}」落入官方客户端遮挡区`,
        detail: `碰撞区域：${safeHits.join("、")}`,
        frameId: frame.id,
        graphicId: g.id,
      });
    }
  }

  // 8. Group 名称与分包预算检查
  for (const grp of frame.groups) {
    if (!grp.name.trim()) {
      issues.push({
        id: nextId(),
        severity: "error",
        code: "GROUP_NAME_EMPTY",
        message: "存在名称为空的图元分组",
        frameId: frame.id,
      });
    } else if (!isValidCIdentifier(grp.name)) {
      issues.push({
        id: nextId(),
        severity: "warn",
        code: "GROUP_NOT_C_IDENT",
        message: `分组「${grp.name}」包含非 C 标识符字符`,
        detail: "后续 CMake 代码生成时将自动进行安全符号清洗",
        frameId: frame.id,
      });
    }
  }

  const budget = calculatePacketBudget(frame, robotRole);
  if (budget.charPacketCount > 6) {
    issues.push({
      id: nextId(),
      severity: "warn",
      code: "HIGH_CHAR_PACKET_COUNT",
      message: `画面「${frame.name}」包含 ${budget.charPacketCount} 个独立字符帧 (${budget.charPacketCount * 60} B)`,
      detail: "每个字符图元独占 1 帧 60B，高频动态刷新文字建议控制在 6 个以内",
      frameId: frame.id,
    });
  }
  if (budget.bandwidthRatioAt10Hz > 0.85) {
    issues.push({
      id: nextId(),
      severity: "warn",
      code: "BANDWIDTH_PRESSURE",
      message: `若以 10Hz 刷新，串口带宽占用将达 ${Math.round(budget.bandwidthRatioAt10Hz * 100)}%`,
      detail: `请合理标记 Static / Dynamic 图元，避免超过 ${budget.bandwidthLimitBytesPerSec} B/s 额度`,
      frameId: frame.id,
    });
  }

  return issues;
}

/** 对整份工程文档运行预检 */
export function preflightDocument(doc: MkuiDocument): PreflightIssue[] {
  const allIssues: PreflightIssue[] = [];
  for (const frame of doc.frames) {
    allIssues.push(...preflightFrame(frame, doc.robotRole));
  }
  return allIssues;
}
