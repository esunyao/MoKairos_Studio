import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Code2,
  Cpu,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ContextMenu, type ContextMenuState } from "@/components/ui/ContextMenu";
import { SimpleSelect } from "@/components/ui/Controls";
import { Badge, Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import {
  applyFlowEdgeChangeset,
  applyFlowNodeChangeset,
  flowNodeRuntimeKey,
  type NodeRuntimeMeta,
} from "@/domain/codegen/flowCanvasState";
import {
  getNodePorts,
  PORT_TYPE_COLORS,
  TRANSFORM_NODE_TEMPLATES,
  validateFlowEdgeCandidate,
  type FlowPortMeta,
} from "@/domain/codegen/nodeRegistry";
import {
  collectGraphicTargetOptions,
  type CodeFunctionInfo,
  type FlowGraph,
  type FlowNode,
  type FlowValueType,
} from "@/domain/codegen/types";
import { useCodefileSync } from "@/hooks/useCodefileSync";
import { useAppStore } from "@/stores/useAppStore";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { MonacoCodeEditor } from "./MonacoCodeEditor";

/**
 * 类 Dify 风格节点编排画布（@xyflow/react）
 * 支持：Mapping 数据变换与映射、API 公开接口扇出编排、代码节点内嵌编辑 ↔ code/*.c 双向同步
 */

interface FlowNodeRenderData extends Record<string, unknown> {
  flowNode: FlowNode;
  title: string;
  subtitle: string;
  inputs: FlowPortMeta[];
  outputs: FlowPortMeta[];
  hasError: boolean;
}

function MokairosFlowNodeCard({ data, selected }: NodeProps<Node<FlowNodeRenderData>>) {
  const { flowNode, title, subtitle, inputs, outputs, hasError } = data;
  return (
    <div
      className={cn(
        "min-w-[205px] rounded-[var(--mk-radius-md)] border bg-[var(--mk-bg-panel)] shadow-md transition-all",
        hasError
          ? "border-[var(--mk-status-error)] ring-2 ring-[var(--mk-status-error)]/30"
          : selected
            ? "border-[var(--mk-accent-primary)] ring-2 ring-[var(--mk-accent-primary)]/25"
            : "border-[var(--mk-border-strong)]",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 px-2.5 py-1.5 rounded-t-[var(--mk-radius-md)]">
        <span className="truncate text-[11px] font-semibold text-[var(--mk-text-primary)]">
          {title}
        </span>
        <span className="rounded bg-[var(--mk-bg-panel)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--mk-text-muted)]">
          {flowNode.kind}
        </span>
      </div>
      {subtitle && (
        <div className="px-2.5 pt-1 text-[10px] font-mono text-[var(--mk-text-muted)] truncate">
          {subtitle}
        </div>
      )}
      <div className="flex justify-between gap-4 px-2.5 py-2">
        <div className="space-y-1.5">
          {inputs.map((port) => (
            <div key={port.id} className="relative flex items-center gap-1.5 pl-1">
              <Handle
                type="target"
                position={Position.Left}
                id={port.id}
                style={{
                  left: -14,
                  width: 9,
                  height: 9,
                  background: PORT_TYPE_COLORS[port.type],
                  border: "1.5px solid var(--mk-bg-panel)",
                }}
              />
              <span className="text-[10px] text-[var(--mk-text-secondary)]">
                {port.label}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 text-right ml-auto">
          {outputs.map((port) => (
            <div key={port.id} className="relative flex items-center justify-end gap-1.5 pr-1">
              <span className="text-[10px] text-[var(--mk-text-secondary)]">
                {port.label}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={port.id}
                style={{
                  right: -14,
                  width: 9,
                  height: 9,
                  background: PORT_TYPE_COLORS[port.type],
                  border: "1.5px solid var(--mk-bg-panel)",
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const NODE_TYPES = { mokairos: MokairosFlowNodeCard };

function nodeDisplayMeta(node: FlowNode): { title: string; subtitle: string } {
  if (node.label) {
    return { title: node.label, subtitle: node.ref ?? "" };
  }
  switch (node.kind) {
    case "symbol_source":
      return { title: "用户符号源", subtitle: node.ref ?? "" };
    case "api_entry":
      return {
        title: `API: ${String(node.params.name ?? "update")}`,
        subtitle: `group: ${String(node.params.group ?? "custom")}`,
      };
    case "const":
      return { title: "常量", subtitle: `${String(node.params.type ?? "float")}: ${String(node.params.value ?? 0)}` };
    case "session_state":
      return { title: "会话状态", subtitle: node.ref ?? "is_ready" };
    case "code_fn":
      return { title: `代码节点: ${node.ref ?? "?"}`, subtitle: "双向同步 C 函数" };
    case "graphic_sink":
      return { title: "图元输出汇", subtitle: node.ref ?? "" };
    default: {
      const tpl = TRANSFORM_NODE_TEMPLATES.find((t) => t.kind === node.kind);
      return { title: tpl?.title ?? node.kind, subtitle: tpl?.subtitle ?? "" };
    }
  }
}

function FlowTabInner({
  onOpenCodeFile,
}: {
  onOpenCodeFile?: (file: string, line?: number) => void;
}) {
  const theme = useAppStore((s) => s.theme);
  const updateNodeInternals = useUpdateNodeInternals();
  const doc = useDocumentStore((s) => s.doc);
  const profile = useCodegenStore((s) => s.profile);
  const activeFlowId = useCodegenStore((s) => s.activeFlowId);
  const setActiveFlowId = useCodegenStore((s) => s.setActiveFlowId);
  const ensureFlowExists = useCodegenStore((s) => s.ensureFlowExists);
  const updateFlowGraph = useCodegenStore((s) => s.updateFlowGraph);
  const parsedFiles = useCodegenStore((s) => s.parsedFiles);
  const codeFiles = useCodegenStore((s) => s.codeFiles);
  const previewDiagnostics = useCodegenStore((s) => s.previewDiagnostics);
  const { syncCodeNodeToFile } = useCodefileSync();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(() => new Set());
  const [runtimeMeta, setRuntimeMeta] = useState<Record<string, NodeRuntimeMeta>>({});
  const [newFlowName, setNewFlowName] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 新建/编辑代码节点弹窗式面板状态
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeName, setCodeName] = useState("mk_custom_fn");
  const [codeOriginalName, setCodeOriginalName] = useState<string | undefined>(undefined);
  const [codeRetType, setCodeRetType] = useState<FlowValueType>("float");
  const [codeParams, setCodeParams] = useState<Array<{ name: string; type: FlowValueType }>>([
    { name: "x", type: "float" },
  ]);
  const [codeBody, setCodeBody] = useState("return x * 1.0f;");

  const flowIds = Object.keys(profile.flows);
  const effectiveFlowId = profile.flows[activeFlowId]
    ? activeFlowId
    : (flowIds[0] ?? "main");
  const currentGraph: FlowGraph = profile.flows[effectiveFlowId] ?? {
    nodes: [],
    edges: [],
  };

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedEdgeIds(new Set());
  }, [effectiveFlowId]);

  const targetOptions = useMemo(() => collectGraphicTargetOptions(doc), [doc]);

  const codeFunctionsMap = useMemo(() => {
    const map: Record<string, CodeFunctionInfo> = {};
    for (const parsed of Object.values(parsedFiles)) {
      for (const fn of parsed.functions) {
        map[fn.name] = fn;
      }
    }
    return map;
  }, [parsedFiles]);

  const portOpts = useMemo(() => {
    const symbolTypes: Record<string, FlowValueType> = {};
    for (const sym of profile.symbols) symbolTypes[sym.id] = sym.type;
    const targetTypes: Record<string, FlowValueType> = {};
    for (const opt of targetOptions) targetTypes[opt.target] = opt.valueType;
    return { symbolTypes, codeFunctions: codeFunctionsMap, targetTypes };
  }, [profile.symbols, codeFunctionsMap, targetOptions]);

  const errorNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of previewDiagnostics) {
      if (d.severity === "error" && d.flowId === effectiveFlowId && d.nodeId) {
        set.add(d.nodeId);
      }
    }
    return set;
  }, [previewDiagnostics, effectiveFlowId]);

  const rfNodes: Array<Node<FlowNodeRenderData>> = useMemo(
    () =>
      currentGraph.nodes.map((fn, idx) => {
        const ports = getNodePorts(fn, portOpts);
        const meta = nodeDisplayMeta(fn);
        const rt = runtimeMeta[flowNodeRuntimeKey(effectiveFlowId, fn.id)];
        const pos =
          fn.position ??
          currentGraph.layout?.[fn.id] ?? [
            80 + (idx % 4) * 260,
            80 + Math.floor(idx / 4) * 150,
          ];
        return {
          id: fn.id,
          type: "mokairos",
          position: rt?.dragPosition ?? { x: pos[0], y: pos[1] },
          selected: fn.id === selectedNodeId,
          ...(rt?.measured ? { measured: rt.measured } : {}),
          ...(rt?.width !== undefined ? { width: rt.width } : {}),
          ...(rt?.height !== undefined ? { height: rt.height } : {}),
          ...(rt?.dragging ? { dragging: true } : {}),
          ...(rt?.resizing ? { resizing: true } : {}),
          data: {
            flowNode: fn,
            title: meta.title,
            subtitle: meta.subtitle,
            inputs: ports.inputs,
            outputs: ports.outputs,
            hasError: errorNodeIds.has(fn.id),
          },
        };
      }),
    [currentGraph, portOpts, runtimeMeta, effectiveFlowId, selectedNodeId, errorNodeIds],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      currentGraph.edges.map((e, idx) => {
        const [srcN, srcP = "out"] = e.from.split(".");
        const [dstN, dstP = "in"] = e.to.split(".");
        const id = e.id || `e_${idx}_${srcN}_${srcP}_${dstN}_${dstP}`;
        return {
          id,
          source: srcN,
          sourceHandle: srcP,
          target: dstN,
          targetHandle: dstP,
          selected: selectedEdgeIds.has(id),
          animated: false,
          style: { strokeWidth: 2, stroke: "var(--mk-accent-primary)" },
        };
      }),
    [currentGraph.edges, selectedEdgeIds],
  );

  const mutateGraph = useCallback(
    (updater: (g: FlowGraph) => FlowGraph) => {
      const base = profile.flows[effectiveFlowId] ?? { nodes: [], edges: [] };
      updateFlowGraph(effectiveFlowId, updater(base));
    },
    [profile.flows, effectiveFlowId, updateFlowGraph],
  );

  const onNodesChange: OnNodesChange<Node<FlowNodeRenderData>> = useCallback(
    (changes) => {
      const res = applyFlowNodeChangeset({
        flowId: effectiveFlowId,
        changes,
        rfNodes,
        currentRuntime: runtimeMeta,
        currentSelectedId: selectedNodeId,
      });
      if (res.runtimeChanged) {
        setRuntimeMeta(res.nextRuntime);
      }
      if (res.selectionChanged) {
        setSelectedNodeId(res.nextSelectedId);
      }
      if (!res.shouldMutateGraph) return;

      const removedSet = new Set(res.removedIds);
      mutateGraph((g) => ({
        ...g,
        nodes: g.nodes
          .filter((n) => !removedSet.has(n.id))
          .map((n) =>
            res.committedPositions[n.id] !== undefined
              ? { ...n, position: res.committedPositions[n.id] }
              : n,
          ),
        edges:
          removedSet.size > 0
            ? g.edges.filter((e) => {
                const [s] = e.from.split(".");
                const [t] = e.to.split(".");
                return !removedSet.has(s) && !removedSet.has(t);
              })
            : g.edges,
      }));
    },
    [effectiveFlowId, rfNodes, runtimeMeta, selectedNodeId, mutateGraph],
  );

  const onEdgesChange: OnEdgesChange<Edge> = useCallback(
    (changes) => {
      const res = applyFlowEdgeChangeset({
        changes,
        rfEdges,
        currentSelectedEdgeIds: selectedEdgeIds,
      });
      if (res.selectionChanged) {
        setSelectedEdgeIds(res.nextSelectedEdgeIds);
      }
      if (!res.shouldMutateGraph) return;

      mutateGraph((g) => ({
        ...g,
        edges: res.nextRfEdges.map((e) => ({
          id: e.id,
          from: `${e.source}.${e.sourceHandle || "out"}`,
          to: `${e.target}.${e.targetHandle || "in"}`,
        })),
      }));
    },
    [rfEdges, selectedEdgeIds, mutateGraph],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const cand = {
        id: `e_${Date.now().toString(36)}`,
        from: `${conn.source}.${conn.sourceHandle || "out"}`,
        to: `${conn.target}.${conn.targetHandle || "in"}`,
      };
      const check = validateFlowEdgeCandidate(currentGraph, cand, portOpts);
      if (!check.valid) {
        toast.error("连线被阻止", { description: check.reason });
        return;
      }
      const nextEdges = addEdge(conn, rfEdges);
      mutateGraph((g) => ({
        ...g,
        edges: nextEdges.map((e) => ({
          id: e.id,
          from: `${e.source}.${e.sourceHandle || "out"}`,
          to: `${e.target}.${e.targetHandle || "in"}`,
        })),
      }));
    },
    [currentGraph, portOpts, rfEdges, mutateGraph],
  );

  const addNode = (partial: Omit<FlowNode, "id">) => {
    const id = `n_${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
    const offset = currentGraph.nodes.length;
    const node: FlowNode = {
      ...partial,
      id,
      position: [120 + (offset % 3) * 240, 90 + Math.floor(offset / 3) * 130],
    };
    mutateGraph((g) => ({ ...g, nodes: [...g.nodes, node] }));
    setSelectedNodeId(id);
  };

  const selectedNode = currentGraph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const openCodeEditorForFunction = (fnName?: string) => {
    const existing = fnName ? codeFunctionsMap[fnName] : undefined;
    if (existing) {
      // 从所属文件截取花括号内部源码
      let extractedBody = "return 0;";
      for (const content of Object.values(codeFiles)) {
        const slice = content.slice(existing.bodyStartByte, existing.bodyEndByte);
        if (slice.startsWith("{") && slice.endsWith("}")) {
          extractedBody = slice.slice(1, -1).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
          break;
        }
      }
      setCodeName(existing.name);
      setCodeOriginalName(existing.name);
      setCodeRetType(existing.portReturn ?? "float");
      setCodeParams(
        existing.params.map((p) => ({ name: p.name, type: p.portType ?? "float" })),
      );
      setCodeBody(extractedBody);
    } else {
      setCodeName(`mk_node_${currentGraph.nodes.length + 1}`);
      setCodeOriginalName(undefined);
      setCodeRetType("float");
      setCodeParams([{ name: "x", type: "float" }]);
      setCodeBody("return x;");
    }
    setCodeModalOpen(true);
  };

  const handleSaveCodeNodeModal = async () => {
    const cleanName = codeName.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanName)) {
      toast.error("函数名必须为合法 C 标识符");
      return;
    }
    const fnInfo = await syncCodeNodeToFile(
      {
        name: cleanName,
        originalName: codeOriginalName,
        returnType: codeRetType,
        params: codeParams,
        docComment: "从节点画布双向同步生成",
        body: codeBody,
      },
      "nodes.c",
    );
    if (fnInfo) {
      if (!codeOriginalName) {
        addNode({ kind: "code_fn", ref: fnInfo.name, params: {} });
      } else if (selectedNode && selectedNode.kind === "code_fn") {
        const targetId = selectedNode.id;
        mutateGraph((g) => ({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === targetId ? { ...n, ref: fnInfo.name } : n,
          ),
        }));
        window.requestAnimationFrame(() => updateNodeInternals(targetId));
      }
    }
    setCodeModalOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* 左栏：组件与节点库 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
        <div className="border-b border-[var(--mk-border-subtle)] p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <Workflow className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />
              工作流画布
            </span>
            <Badge tone="neutral">{profile.mode}</Badge>
          </div>
          <div className="flex gap-1.5">
            <SimpleSelect
              value={effectiveFlowId}
              onValueChange={setActiveFlowId}
              options={(flowIds.length > 0 ? flowIds : ["main"]).map((id) => ({
                value: id,
                label: id,
              }))}
            />
            <Input
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="新流程名"
              className="w-24 text-[11px]"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const name = newFlowName.trim();
                if (!name) return;
                ensureFlowExists(name);
                setNewFlowName("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-4 text-xs">
          {/* 源节点 */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mk-text-muted)]">
              数据源 / 接口入口
            </div>
            {profile.mode === "api" ? (
              <button
                type="button"
                onClick={() =>
                  addNode({
                    kind: "api_entry",
                    params: {
                      name: `update_${effectiveFlowId}`,
                      group: "hud",
                      public: true,
                      args: [{ name: "val", type: "float" }],
                    },
                  })
                }
                className="flex w-full items-center justify-between rounded-[var(--mk-radius-sm)] border border-[var(--mk-accent-primary)]/40 bg-[var(--mk-accent-primary-tint)] px-2.5 py-1.5 text-left hover:brightness-110 cursor-pointer"
              >
                <span className="font-medium text-[var(--mk-text-primary)]">+ 公开 API 入口节点</span>
                <Cpu className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />
              </button>
            ) : (
              profile.symbols.map((sym) => (
                <button
                  key={sym.id}
                  type="button"
                  onClick={() =>
                    addNode({ kind: "symbol_source", ref: `symbol:${sym.id}`, params: {} })
                  }
                  className="flex w-full items-center justify-between rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 py-1 text-left hover:border-[var(--mk-accent-primary)] cursor-pointer"
                >
                  <span className="truncate font-mono text-[11px]">{sym.id}</span>
                  <Badge tone="neutral">{sym.type}</Badge>
                </button>
              ))
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  addNode({ kind: "const", params: { type: "float", value: 1.0 } })
                }
                className="rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 py-1 text-[11px] hover:border-[var(--mk-border-strong)] cursor-pointer"
              >
                + 常量
              </button>
              <button
                type="button"
                onClick={() =>
                  addNode({ kind: "session_state", ref: "is_ready", params: {} })
                }
                className="rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 py-1 text-[11px] hover:border-[var(--mk-border-strong)] cursor-pointer"
              >
                + 会话状态
              </button>
            </div>
          </div>

          {/* 变换节点 */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mk-text-muted)]">
              变换与判断节点
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TRANSFORM_NODE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.kind}
                  type="button"
                  onClick={() =>
                    addNode({ kind: tpl.kind, params: { ...tpl.defaultParams } })
                  }
                  className="rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 py-1.5 text-left hover:border-[var(--mk-accent-primary)] cursor-pointer"
                >
                  <div className="text-[11px] font-medium truncate">{tpl.title}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 代码节点（双向同步） */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mk-text-muted)]">
                代码节点 (双向同步)
              </span>
              <button
                type="button"
                onClick={() => openCodeEditorForFunction()}
                className="flex items-center gap-0.5 text-[11px] text-[var(--mk-accent-primary)] hover:underline cursor-pointer"
              >
                <Plus className="h-3 w-3" /> 新建
              </button>
            </div>
            {Object.values(codeFunctionsMap).map((fn) => (
              <button
                key={fn.name}
                type="button"
                disabled={!fn.wireable}
                onClick={() => addNode({ kind: "code_fn", ref: fn.name, params: {} })}
                className={cn(
                  "flex w-full items-center justify-between rounded-[var(--mk-radius-sm)] border px-2 py-1 text-left text-[11px]",
                  fn.wireable
                    ? "border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] hover:border-[var(--mk-accent-primary)] cursor-pointer"
                    : "border-dashed border-[var(--mk-border-subtle)] opacity-55 cursor-not-allowed",
                )}
                title={fn.unsupportedReason || `${fn.returnType} ${fn.name}(...)`}
              >
                <span className="truncate font-mono">{fn.name}</span>
                <Code2 className="h-3 w-3 shrink-0 text-[var(--mk-accent-primary)]" />
              </button>
            ))}
          </div>

          {/* 动态图元字段汇 */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mk-text-muted)]">
              图元输出目标 (Sink)
            </div>
            {targetOptions.map((opt) => (
              <button
                key={opt.target}
                type="button"
                onClick={() =>
                  addNode({ kind: "graphic_sink", ref: opt.target, params: {} })
                }
                className="flex w-full items-center justify-between rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 py-1 text-left hover:border-[var(--mk-accent-primary)] cursor-pointer"
              >
                <span className="truncate text-[11px]">{opt.label}</span>
                <Badge tone="neutral">{opt.valueType}</Badge>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* 中央：React Flow 画布 */}
      <div className="relative flex-1 min-w-0 bg-[var(--mk-bg-canvas)]">
        <ReactFlow
          className={theme}
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeIds(new Set());
          }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            setSelectedNodeId(node.id);
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                ...(node.data.flowNode.kind === "code_fn"
                  ? [
                      {
                        id: "edit_code",
                        label: "编辑代码节点函数体",
                        icon: <Code2 className="h-3.5 w-3.5" />,
                        onSelect: () => openCodeEditorForFunction(node.data.flowNode.ref),
                      },
                      ...(onOpenCodeFile
                        ? [
                            {
                              id: "open_code_ide",
                              label: "在纯代码编辑器中定位",
                              icon: <Code2 className="h-3.5 w-3.5" />,
                              onSelect: () => {
                                const fnName = node.data.flowNode.ref;
                                for (const [filePath, parsed] of Object.entries(parsedFiles)) {
                                  const hit = parsed.functions.find((f) => f.name === fnName);
                                  if (hit) {
                                    onOpenCodeFile(filePath, hit.startLine);
                                    return;
                                  }
                                }
                                onOpenCodeFile("nodes.c");
                              },
                            },
                          ]
                        : []),
                    ]
                  : []),
                {
                  id: "del_node",
                  label: "删除节点",
                  danger: true,
                  icon: <Trash2 className="h-3.5 w-3.5" />,
                  onSelect: () => {
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.filter((n) => n.id !== node.id),
                      edges: g.edges.filter(
                        (edge) =>
                          edge.from.split(".")[0] !== node.id &&
                          edge.to.split(".")[0] !== node.id,
                      ),
                    }));
                    if (selectedNodeId === node.id) setSelectedNodeId(null);
                  },
                },
              ],
            });
          }}
          fitView
        >
          <Background gap={18} size={1.4} color="var(--mk-dot-grid)" />
          <MiniMap
            zoomable
            pannable
            nodeColor="var(--mk-accent-primary)"
            maskColor={theme === "dark" ? "rgba(13, 17, 23, 0.65)" : "rgba(241, 245, 249, 0.72)"}
            style={{
              backgroundColor: "var(--mk-bg-panel)",
              border: "1px solid var(--mk-border-subtle)",
              borderRadius: 8,
            }}
          />
          <Controls />
        </ReactFlow>

        {codeModalOpen && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-6">
            <div className="flex h-[520px] w-full max-w-2xl flex-col rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-strong)] bg-[var(--mk-bg-panel)] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--mk-border-subtle)] px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Sparkles className="h-4 w-4 text-[var(--mk-accent-primary)]" />
                  代码节点编辑器（自动同步至 code/nodes.c）
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCodeModalOpen(false)}>
                  取消
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-[var(--mk-border-subtle)] p-3 text-xs">
                <Input
                  value={codeName}
                  onChange={(e) => setCodeName(e.target.value)}
                  placeholder="函数名"
                  className="font-mono"
                />
                <SimpleSelect
                  value={codeRetType}
                  onValueChange={(v) => setCodeRetType(v as FlowValueType)}
                  options={[
                    { value: "float", label: "返回 float" },
                    { value: "int32", label: "返回 int32_t" },
                    { value: "bool", label: "返回 int (bool)" },
                    { value: "color", label: "返回 color_t" },
                    { value: "text", label: "返回 const char*" },
                  ]}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setCodeParams((prev) => [
                      ...prev,
                      { name: `p${prev.length}`, type: "float" },
                    ])
                  }
                >
                  + 添加输入参数
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 border-b border-[var(--mk-border-subtle)] px-3 py-2">
                {codeParams.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 py-1"
                  >
                    <Input
                      value={p.name}
                      onChange={(e) =>
                        setCodeParams((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, name: e.target.value } : item,
                          ),
                        )
                      }
                      className="h-6 w-20 font-mono text-[11px]"
                    />
                    <SimpleSelect
                      value={p.type}
                      onValueChange={(v) =>
                        setCodeParams((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, type: v as FlowValueType } : item,
                          ),
                        )
                      }
                      options={[
                        { value: "float", label: "float" },
                        { value: "int32", label: "int32" },
                        { value: "bool", label: "bool" },
                        { value: "color", label: "color" },
                        { value: "text", label: "text" },
                      ]}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setCodeParams((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-[var(--mk-status-error)] text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                <MonacoCodeEditor
                  value={codeBody}
                  language="c"
                  onChange={setCodeBody}
                  onSave={() => void handleSaveCodeNodeModal()}
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--mk-border-subtle)] px-4 py-2.5">
                <Button variant="primary" size="sm" onClick={() => void handleSaveCodeNodeModal()}>
                  保存并同步到节点图与 code/nodes.c
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右栏：选中节点属性检视器 */}
      <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-3.5 overflow-y-auto space-y-3">
        <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
          节点属性与参数
        </div>

        {!selectedNode ? (
          <div className="text-xs text-[var(--mk-text-muted)] leading-relaxed">
            在画布上选中节点可配置参数、修改 API 入口签名或打开代码节点双向编辑器；右键节点可删除。
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <Badge tone="accent">{selectedNode.kind}</Badge>
              <span className="font-mono text-[10px] text-[var(--mk-text-muted)]">
                {selectedNode.id}
              </span>
            </div>

            {selectedNode.kind === "code_fn" && (
              <div className="space-y-2">
                <div className="text-[11px] text-[var(--mk-text-secondary)]">
                  关联 C 函数：<code className="font-mono">{selectedNode.ref}</code>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => openCodeEditorForFunction(selectedNode.ref)}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  在 Monaco 中编辑代码节点
                </Button>
              </div>
            )}

            {selectedNode.kind === "api_entry" && (
              <div className="space-y-2">
                <label className="block text-[11px] text-[var(--mk-text-secondary)]">
                  公开函数名（加前缀 {profile.prefix}_）
                </label>
                <Input
                  value={String(selectedNode.params.name ?? "")}
                  onChange={(e) =>
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, params: { ...n.params, name: e.target.value } }
                          : n,
                      ),
                    }))
                  }
                  className="font-mono"
                />
                <label className="block text-[11px] text-[var(--mk-text-secondary)]">分组注释</label>
                <Input
                  value={String(selectedNode.params.group ?? "hud")}
                  onChange={(e) =>
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, params: { ...n.params, group: e.target.value } }
                          : n,
                      ),
                    }))
                  }
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const targetId = selectedNode.id;
                    const args = Array.isArray(selectedNode.params.args)
                      ? [...(selectedNode.params.args as Array<{ name: string; type: FlowValueType }>)]
                      : [];
                    args.push({ name: `arg${args.length}`, type: "float" });
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === targetId
                          ? { ...n, params: { ...n.params, args } }
                          : n,
                      ),
                    }));
                    window.requestAnimationFrame(() => updateNodeInternals(targetId));
                  }}
                >
                  + 添加接口参数
                </Button>
              </div>
            )}

            {selectedNode.kind === "scale_offset" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">比例 k</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(selectedNode.params.k ?? 1)}
                    onChange={(e) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, k: Number(e.target.value) } }
                            : n,
                        ),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">偏置 b</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(selectedNode.params.b ?? 0)}
                    onChange={(e) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, b: Number(e.target.value) } }
                            : n,
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {selectedNode.kind === "const" && (
              <div className="space-y-2">
                <SimpleSelect
                  value={String(selectedNode.params.type ?? "float")}
                  onValueChange={(v) =>
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, params: { ...n.params, type: v } }
                          : n,
                      ),
                    }))
                  }
                  options={[
                    { value: "float", label: "float" },
                    { value: "int32", label: "int32" },
                    { value: "bool", label: "bool" },
                    { value: "color", label: "color" },
                    { value: "text", label: "text" },
                  ]}
                />
                <Input
                  value={String(selectedNode.params.value ?? "")}
                  onChange={(e) => {
                    const t = String(selectedNode.params.type ?? "float");
                    const raw = e.target.value;
                    const parsed =
                      t === "float" || t === "int32"
                        ? Number(raw) || 0
                        : t === "bool"
                          ? raw === "true" || raw === "1"
                          : raw;
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, params: { ...n.params, value: parsed } }
                          : n,
                      ),
                    }));
                  }}
                />
              </div>
            )}

            <div>
              <label className="text-[11px] text-[var(--mk-text-secondary)]">
                节点参数 JSON（高级编辑）
              </label>
              <pre className="mt-1 max-h-48 overflow-auto rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-code)] p-2 font-mono text-[10px] text-[var(--mk-text-secondary)]">
                {JSON.stringify(selectedNode.params, null, 2)}
              </pre>
            </div>

            <Button
              variant="danger"
              size="sm"
              className="w-full"
              onClick={() => {
                mutateGraph((g) => ({
                  ...g,
                  nodes: g.nodes.filter((n) => n.id !== selectedNode.id),
                  edges: g.edges.filter(
                    (edge) =>
                      edge.from.split(".")[0] !== selectedNode.id &&
                      edge.to.split(".")[0] !== selectedNode.id,
                  ),
                }));
                setSelectedNodeId(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除当前节点
            </Button>
          </div>
        )}
      </aside>

      <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}

export function FlowTab(props: {
  onOpenCodeFile?: (file: string, line?: number) => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowTabInner {...props} />
    </ReactFlowProvider>
  );
}
