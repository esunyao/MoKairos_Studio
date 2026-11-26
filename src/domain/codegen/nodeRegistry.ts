import type { CodeFunctionInfo, FlowEdge, FlowGraph, FlowNode, FlowValueType } from "./types";

/**
 * React Flow 节点目录、端口类型颜色与前端即时拓扑/类型校验
 */

export interface FlowPortMeta {
  id: string;
  label: string;
  type: FlowValueType | "any";
}

export interface FlowNodeTemplate {
  kind: string;
  category: "source" | "transform" | "sink" | "code";
  title: string;
  subtitle: string;
  defaultParams: Record<string, unknown>;
}

export const PORT_TYPE_COLORS: Record<FlowValueType | "any", string> = {
  int32: "#38bdf8",
  float: "#22c55e",
  bool: "#f59e0b",
  color: "#c084fc",
  text: "#f472b6",
  any: "#94a3b8",
};

export const TRANSFORM_NODE_TEMPLATES: readonly FlowNodeTemplate[] = [
  {
    kind: "scale_offset",
    category: "transform",
    title: "缩放偏移",
    subtitle: "x * k + b",
    defaultParams: { k: 1.0, b: 0.0 },
  },
  {
    kind: "clamp",
    category: "transform",
    title: "范围限幅",
    subtitle: "clamp(x, lo, hi)",
    defaultParams: { lo: 0.0, hi: 1.0 },
  },
  {
    kind: "remap",
    category: "transform",
    title: "区间线性映射",
    subtitle: "[in_min..in_max] → [out_min..out_max]",
    defaultParams: { in_min: 0, in_max: 100, out_min: 0, out_max: 1 },
  },
  {
    kind: "threshold_color",
    category: "transform",
    title: "阈值变色",
    subtitle: "按分段阈值输出协议 9 色",
    defaultParams: {
      steps: [
        [0.8, "green"],
        [0.2, "orange"],
      ],
      else: "pink",
    },
  },
  {
    kind: "round_int",
    category: "transform",
    title: "浮点取整",
    subtitle: "float → int32",
    defaultParams: {},
  },
  {
    kind: "compare",
    category: "transform",
    title: "数值比较",
    subtitle: "a > b → bool",
    defaultParams: { op: "gt" },
  },
  {
    kind: "logic",
    category: "transform",
    title: "布尔逻辑",
    subtitle: "and / or / not",
    defaultParams: { op: "and" },
  },
  {
    kind: "mux",
    category: "transform",
    title: "条件选择 (Mux)",
    subtitle: "cond ? a : b",
    defaultParams: {},
  },
  {
    kind: "edge",
    category: "transform",
    title: "边沿检测",
    subtitle: "rising / falling",
    defaultParams: { mode: "rising" },
  },
  {
    kind: "text_select",
    category: "transform",
    title: "状态查表文本",
    subtitle: "int → text",
    defaultParams: { cases: ["STOP", "READY", "ACTIVE"], default: "UNKNOWN" },
  },
];

export function isPortTypeCompatible(
  source: FlowValueType | "any",
  target: FlowValueType | "any",
): boolean {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  return source === "int32" && target === "float";
}

export function getNodePorts(
  node: FlowNode,
  opts?: {
    symbolTypes?: Record<string, FlowValueType>;
    codeFunctions?: Record<string, CodeFunctionInfo>;
    targetTypes?: Record<string, FlowValueType>;
  },
): { inputs: FlowPortMeta[]; outputs: FlowPortMeta[] } {
  switch (node.kind) {
    case "symbol_source": {
      const symId = (node.ref ?? "").replace(/^symbol:/, "");
      const t = opts?.symbolTypes?.[symId] ?? "float";
      return {
        inputs: [],
        outputs: [{ id: "out", label: symId || "符号值", type: t }],
      };
    }
    case "api_entry": {
      const args = Array.isArray(node.params.args)
        ? (node.params.args as Array<{ name?: string; type?: FlowValueType }>)
        : [];
      return {
        inputs: [],
        outputs: args.map((a, idx) => ({
          id: `arg${idx}`,
          label: `${a.name || `arg${idx}`} (${a.type || "float"})`,
          type: a.type || "float",
        })),
      };
    }
    case "const": {
      const t = (node.params.type as FlowValueType | undefined) ?? "float";
      return { inputs: [], outputs: [{ id: "out", label: "常量", type: t }] };
    }
    case "session_state": {
      const isRid = node.ref === "robot_id";
      return {
        inputs: [],
        outputs: [{ id: "out", label: isRid ? "robot_id" : "is_ready", type: isRid ? "int32" : "bool" }],
      };
    }
    case "scale_offset":
    case "clamp":
    case "remap":
      return {
        inputs: [{ id: "in", label: "in", type: "float" }],
        outputs: [{ id: "out", label: "out", type: "float" }],
      };
    case "threshold_color":
      return {
        inputs: [{ id: "in", label: "数值", type: "float" }],
        outputs: [{ id: "out", label: "颜色", type: "color" }],
      };
    case "round_int":
      return {
        inputs: [{ id: "in", label: "float", type: "float" }],
        outputs: [{ id: "out", label: "int32", type: "int32" }],
      };
    case "compare":
      return {
        inputs: [
          { id: "a", label: "a", type: "float" },
          { id: "b", label: "b", type: "float" },
        ],
        outputs: [{ id: "out", label: "bool", type: "bool" }],
      };
    case "logic": {
      const op = String(node.params.op ?? "and");
      return {
        inputs:
          op === "not"
            ? [{ id: "a", label: "a", type: "bool" }]
            : [
                { id: "a", label: "a", type: "bool" },
                { id: "b", label: "b", type: "bool" },
              ],
        outputs: [{ id: "out", label: "bool", type: "bool" }],
      };
    }
    case "mux":
      return {
        inputs: [
          { id: "cond", label: "cond", type: "bool" },
          { id: "a", label: "真分支 a", type: "any" },
          { id: "b", label: "假分支 b", type: "any" },
        ],
        outputs: [{ id: "out", label: "out", type: "any" }],
      };
    case "edge":
      return {
        inputs: [{ id: "in", label: "bool", type: "bool" }],
        outputs: [{ id: "out", label: "脉冲", type: "bool" }],
      };
    case "text_select":
      return {
        inputs: [{ id: "in", label: "索引", type: "int32" }],
        outputs: [{ id: "out", label: "文本", type: "text" }],
      };
    case "code_fn": {
      const fnName = node.ref ?? "";
      const fnInfo = opts?.codeFunctions?.[fnName];
      if (!fnInfo) {
        return {
          inputs: [{ id: "p0", label: "缺失函数", type: "any" }],
          outputs: [{ id: "out", label: "out", type: "any" }],
        };
      }
      return {
        inputs: fnInfo.params.map((p, idx) => ({
          id: p.name || `p${idx}`,
          label: p.name,
          type: p.portType ?? "any",
        })),
        outputs: [{ id: "out", label: fnInfo.returnType, type: fnInfo.portReturn ?? "any" }],
      };
    }
    case "graphic_sink": {
      const target = node.ref ?? "";
      const t = opts?.targetTypes?.[target] ?? "any";
      return {
        inputs: [{ id: "in", label: target || "目标字段", type: t }],
        outputs: [],
      };
    }
    default:
      return { inputs: [{ id: "in", label: "in", type: "any" }], outputs: [{ id: "out", label: "out", type: "any" }] };
  }
}

/** 检测新连线是否会成环（Kahn / BFS 可达性） */
export function wouldCreateCycle(graph: FlowGraph, fromNode: string, toNode: string): boolean {
  if (fromNode === toNode) return true;
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const src = e.from.split(".")[0];
    const dst = e.to.split(".")[0];
    const list = adj.get(src);
    if (list) list.push(dst);
    else adj.set(src, [dst]);
  }
  const visited = new Set<string>([toNode]);
  const queue = [toNode];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === fromNode) return true;
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export function validateFlowEdgeCandidate(
  graph: FlowGraph,
  edge: FlowEdge,
  opts?: Parameters<typeof getNodePorts>[1],
): { valid: boolean; reason?: string } {
  const [srcNodeId, srcPortId = "out"] = edge.from.split(".");
  const [dstNodeId, dstPortId = "in"] = edge.to.split(".");
  const srcNode = graph.nodes.find((n) => n.id === srcNodeId);
  const dstNode = graph.nodes.find((n) => n.id === dstNodeId);
  if (!srcNode || !dstNode) {
    return { valid: false, reason: "找不到起止节点" };
  }
  if (wouldCreateCycle(graph, srcNodeId, dstNodeId)) {
    return { valid: false, reason: "连线会形成环路（节点图必须为 DAG）" };
  }
  const srcPort = getNodePorts(srcNode, opts).outputs.find((p) => p.id === srcPortId);
  const dstPort = getNodePorts(dstNode, opts).inputs.find((p) => p.id === dstPortId);
  if (!srcPort || !dstPort) {
    return { valid: false, reason: "端口不存在" };
  }
  if (!isPortTypeCompatible(srcPort.type, dstPort.type)) {
    return {
      valid: false,
      reason: `类型不匹配：${srcPort.type} 不能直接连接到 ${dstPort.type}`,
    };
  }
  return { valid: true };
}
