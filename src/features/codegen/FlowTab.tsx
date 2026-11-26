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
  useReactFlow,
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
  Copy,
  Cpu,
  Maximize2,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ContextMenu, type ContextMenuState } from "@/components/ui/ContextMenu";
import { SimpleSelect, Switch } from "@/components/ui/Controls";
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
import { sliceUtf8Bytes } from "@/domain/codegen/profileSerializer";
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

const FLOW_COLOR_OPTIONS = [
  { value: "team", label: "主色 (team)" },
  { value: "yellow", label: "黄色 (yellow)" },
  { value: "green", label: "绿色 (green)" },
  { value: "orange", label: "橙色 (orange)" },
  { value: "purple", label: "紫色 (purple)" },
  { value: "pink", label: "粉色 (pink)" },
  { value: "cyan", label: "青色 (cyan)" },
  { value: "black", label: "黑色 (black)" },
  { value: "white", label: "白色 (white)" },
] as const;

/** 允许完整输入小数点与负号（如 "3."、"-0.5"）的受控数值输入框 */
function NumericParamInput({
  value,
  integer = false,
  onCommit,
  className,
}: {
  value: number;
  integer?: boolean;
  onCommit: (next: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string>(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      className={cn("font-mono", className)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const trimmed = draft.trim();
        const num = integer ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed);
        if (Number.isFinite(num)) {
          setDraft(String(num));
          onCommit(num);
        } else {
          setDraft(String(value));
        }
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const trimmed = raw.trim();
        if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-." || trimmed.endsWith(".")) {
          return;
        }
        const num = integer ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed);
        if (Number.isFinite(num)) {
          onCommit(num);
        }
      }}
    />
  );
}

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
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const doc = useDocumentStore((s) => s.doc);
  const profile = useCodegenStore((s) => s.profile);
  const activeFlowId = useCodegenStore((s) => s.activeFlowId);
  const setActiveFlowId = useCodegenStore((s) => s.setActiveFlowId);
  const setActiveSubTab = useCodegenStore((s) => s.setActiveSubTab);
  const ensureFlowExists = useCodegenStore((s) => s.ensureFlowExists);
  const deleteFlowGraph = useCodegenStore((s) => s.deleteFlowGraph);
  const mutateFlowGraph = useCodegenStore((s) => s.mutateFlowGraph);
  const parsedFiles = useCodegenStore((s) => s.parsedFiles);
  const codeFiles = useCodegenStore((s) => s.codeFiles);
  const previewDiagnostics = useCodegenStore((s) => s.previewDiagnostics);
  const { syncCodeNodeToFile } = useCodefileSync();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(() => new Set());
  const [runtimeMeta, setRuntimeMeta] = useState<Record<string, NodeRuntimeMeta>>({});
  const [newFlowName, setNewFlowName] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");

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
      mutateFlowGraph(effectiveFlowId, updater);
    },
    [effectiveFlowId, mutateFlowGraph],
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
  const selectedEdges = rfEdges.filter((e) => selectedEdgeIds.has(e.id));

  useEffect(() => {
    if (selectedNode) {
      setJsonDraft(JSON.stringify(selectedNode.params, null, 2));
    } else {
      setJsonDraft("");
    }
  }, [selectedNode?.id, selectedNode?.params]);

  const deleteSelectedNodeOrEdges = useCallback(() => {
    if (selectedNodeId) {
      const targetId = selectedNodeId;
      mutateGraph((g) => ({
        ...g,
        nodes: g.nodes.filter((n) => n.id !== targetId),
        edges: g.edges.filter(
          (edge) =>
            edge.from.split(".")[0] !== targetId &&
            edge.to.split(".")[0] !== targetId,
        ),
      }));
      setRuntimeMeta((prev) => {
        const key = flowNodeRuntimeKey(effectiveFlowId, targetId);
        if (prev[key] === undefined) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setSelectedNodeId(null);
      return true;
    }
    if (selectedEdgeIds.size > 0) {
      const edgeIds = new Set(selectedEdgeIds);
      const remaining = rfEdges.filter((e) => !edgeIds.has(e.id));
      mutateGraph((g) => ({
        ...g,
        edges: remaining.map((e) => ({
          id: e.id,
          from: `${e.source}.${e.sourceHandle || "out"}`,
          to: `${e.target}.${e.targetHandle || "in"}`,
        })),
      }));
      setSelectedEdgeIds(new Set());
      return true;
    }
    return false;
  }, [selectedNodeId, selectedEdgeIds, rfEdges, effectiveFlowId, mutateGraph]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (codeModalOpen) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          Boolean(target.closest(".monaco-editor")))
      ) {
        return;
      }
      if (deleteSelectedNodeOrEdges()) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [codeModalOpen, deleteSelectedNodeOrEdges]);

  const openCodeEditorForFunction = (fnName?: string) => {
    const existing = fnName ? codeFunctionsMap[fnName] : undefined;
    if (existing) {
      // 按 UTF-8 字节偏移从所属文件截取花括号内部源码
      let extractedBody = "return 0;";
      for (const content of Object.values(codeFiles)) {
        const slice = sliceUtf8Bytes(content, existing.bodyStartByte, existing.bodyEndByte);
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
      setCodeModalOpen(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* 左栏：组件与节点库 */}
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
        <div className="border-b border-[var(--mk-border-subtle)] p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <Workflow className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />
              工作流画布
            </span>
            <Badge tone="neutral">{profile.mode}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <SimpleSelect
                value={effectiveFlowId}
                onValueChange={setActiveFlowId}
                options={(flowIds.length > 0 ? flowIds : ["main"]).map((id) => ({
                  value: id,
                  label: id,
                }))}
              />
            </div>
            {flowIds.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => deleteFlowGraph(effectiveFlowId)}
                title="删除当前流程"
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--mk-status-error)]" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="新建流程名..."
              className="min-w-0 flex-1 text-[11px]"
            />
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => {
                const name = newFlowName.trim();
                if (!name) return;
                ensureFlowExists(name);
                setNewFlowName("");
              }}
              title="新增流程"
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
            ) : profile.symbols.length === 0 ? (
              <button
                type="button"
                onClick={() => setActiveSubTab("wizard")}
                className="w-full rounded-[var(--mk-radius-sm)] border border-dashed border-[var(--mk-border-strong)] px-2 py-1.5 text-left text-[11px] text-[var(--mk-text-muted)] hover:border-[var(--mk-accent-primary)] hover:text-[var(--mk-accent-primary)] cursor-pointer"
              >
                尚未声明用户符号 → 点击前往「配置向导」添加
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
          deleteKeyCode={["Backspace", "Delete"]}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeIds(new Set());
          }}
          onEdgeClick={(_, edge) => {
            setSelectedNodeId(null);
            setSelectedEdgeIds(new Set([edge.id]));
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeIds(new Set());
          }}
          onPaneContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: "fit_flow",
                  label: "适应画布视口",
                  icon: <Maximize2 className="h-3.5 w-3.5" />,
                  onSelect: () => void fitView({ padding: 0.2 }),
                },
              ],
            });
          }}
          onEdgeContextMenu={(e, edge) => {
            e.preventDefault();
            e.stopPropagation();
            setSelectedNodeId(null);
            setSelectedEdgeIds(new Set([edge.id]));
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: "del_edge",
                  label: "删除连线",
                  danger: true,
                  shortcut: "Del",
                  icon: <Trash2 className="h-3.5 w-3.5" />,
                  onSelect: () => {
                    const remaining = rfEdges.filter((item) => item.id !== edge.id);
                    mutateGraph((g) => ({
                      ...g,
                      edges: remaining.map((item) => ({
                        id: item.id,
                        from: `${item.source}.${item.sourceHandle || "out"}`,
                        to: `${item.target}.${item.targetHandle || "in"}`,
                      })),
                    }));
                    setSelectedEdgeIds(new Set());
                  },
                },
              ],
            });
          }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            e.stopPropagation();
            setSelectedNodeId(node.id);
            setSelectedEdgeIds(new Set());
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: "dup_node",
                  label: "复制节点",
                  icon: <Copy className="h-3.5 w-3.5" />,
                  onSelect: () => {
                    const src = node.data.flowNode;
                    const newId = `n_${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
                    const basePos = src.position ?? [120, 120];
                    mutateGraph((g) => ({
                      ...g,
                      nodes: [
                        ...g.nodes,
                        {
                          ...src,
                          id: newId,
                          params: JSON.parse(JSON.stringify(src.params ?? {})) as Record<string, unknown>,
                          position: [basePos[0] + 40, basePos[1] + 40],
                        },
                      ],
                    }));
                    setSelectedNodeId(newId);
                  },
                },
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
                  shortcut: "Del",
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
                    setRuntimeMeta((prev) => {
                      const key = flowNodeRuntimeKey(effectiveFlowId, node.id);
                      if (prev[key] === undefined) return prev;
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
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

      {/* 右栏：选中节点/连线属性检视器 */}
      <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-3.5 overflow-y-auto space-y-3">
        <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
          节点属性与参数
        </div>

        {!selectedNode && selectedEdges.length > 0 ? (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <Badge tone="accent">edge 连线</Badge>
              <span className="font-mono text-[10px] text-[var(--mk-text-muted)]">
                共 {selectedEdges.length} 条
              </span>
            </div>
            <div className="rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2.5 space-y-1 font-mono text-[11px] text-[var(--mk-text-secondary)]">
              {selectedEdges.map((edge) => (
                <div key={edge.id} className="truncate">
                  {edge.source}.{edge.sourceHandle || "out"} → {edge.target}.{edge.targetHandle || "in"}
                </div>
              ))}
            </div>
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              onClick={() => void deleteSelectedNodeOrEdges()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除选中连线 (Del)
            </Button>
          </div>
        ) : !selectedNode ? (
          <div className="text-xs text-[var(--mk-text-muted)] leading-relaxed">
            在画布上选中节点或连线可配置参数，支持 Delete / Backspace 删除或右键打开快捷菜单。
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
                {onOpenCodeFile && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const fnName = selectedNode.ref;
                      for (const [fp, parsed] of Object.entries(parsedFiles)) {
                        const hit = parsed.functions.find((f) => f.name === fnName);
                        if (hit) {
                          onOpenCodeFile(fp, hit.startLine);
                          return;
                        }
                      }
                      onOpenCodeFile("nodes.c");
                    }}
                  >
                    在纯代码编辑器中定位
                  </Button>
                )}
              </div>
            )}

            {selectedNode.kind === "symbol_source" && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">绑定用户符号</label>
                {profile.symbols.length === 0 ? (
                  <div className="text-[11px] text-[var(--mk-text-muted)]">
                    当前无用户符号，请前往「配置向导」添加。
                  </div>
                ) : (
                  <SimpleSelect
                    value={String(selectedNode.ref ?? "").replace(/^symbol:/, "")}
                    onValueChange={(val) => {
                      const targetId = selectedNode.id;
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === targetId ? { ...n, ref: `symbol:${val}` } : n,
                        ),
                      }));
                      window.requestAnimationFrame(() => updateNodeInternals(targetId));
                    }}
                    options={profile.symbols.map((s) => ({
                      value: s.id,
                      label: `${s.id} (${s.type})`,
                    }))}
                  />
                )}
              </div>
            )}

            {selectedNode.kind === "session_state" && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">运行时状态源</label>
                <SimpleSelect
                  value={selectedNode.ref ?? "is_ready"}
                  onValueChange={(val) =>
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id ? { ...n, ref: val } : n,
                      ),
                    }))
                  }
                  options={[
                    { value: "is_ready", label: "is_ready（链路在线与就绪）" },
                    { value: "robot_id", label: "robot_id（本机机器人 ID）" },
                  ]}
                />
              </div>
            )}

            {selectedNode.kind === "graphic_sink" && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">绑定图元目标字段</label>
                <SimpleSelect
                  value={selectedNode.ref ?? ""}
                  onValueChange={(val) => {
                    const targetId = selectedNode.id;
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === targetId ? { ...n, ref: val } : n,
                      ),
                    }));
                    window.requestAnimationFrame(() => updateNodeInternals(targetId));
                  }}
                  options={targetOptions.map((o) => ({
                    value: o.target,
                    label: `${o.label} [${o.valueType}]`,
                  }))}
                />
              </div>
            )}

            {selectedNode.kind === "api_entry" && (
              <div className="space-y-2.5">
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
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
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
                  </div>
                  <label className="flex items-center justify-between rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 py-1 text-[11px]">
                    <span>public</span>
                    <Switch
                      checked={selectedNode.params.public !== false}
                      onCheckedChange={(checked) =>
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, public: checked } }
                              : n,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] text-[var(--mk-text-secondary)]">接口参数列表</div>
                  {(Array.isArray(selectedNode.params.args)
                    ? (selectedNode.params.args as Array<{ name: string; type: FlowValueType }>)
                    : []
                  ).map((arg, idx, list) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input
                        value={arg.name}
                        className="h-7 flex-1 font-mono text-[11px]"
                        onChange={(e) => {
                          const targetId = selectedNode.id;
                          const nextArgs = list.map((item, i) =>
                            i === idx ? { ...item, name: e.target.value } : item,
                          );
                          mutateGraph((g) => ({
                            ...g,
                            nodes: g.nodes.map((n) =>
                              n.id === targetId
                                ? { ...n, params: { ...n.params, args: nextArgs } }
                                : n,
                            ),
                          }));
                          window.requestAnimationFrame(() => updateNodeInternals(targetId));
                        }}
                      />
                      <SimpleSelect
                        value={arg.type}
                        className="w-24"
                        onValueChange={(v) => {
                          const targetId = selectedNode.id;
                          const nextArgs = list.map((item, i) =>
                            i === idx ? { ...item, type: v as FlowValueType } : item,
                          );
                          mutateGraph((g) => ({
                            ...g,
                            nodes: g.nodes.map((n) =>
                              n.id === targetId
                                ? { ...n, params: { ...n.params, args: nextArgs } }
                                : n,
                            ),
                          }));
                          window.requestAnimationFrame(() => updateNodeInternals(targetId));
                        }}
                        options={[
                          { value: "float", label: "float" },
                          { value: "int32", label: "int32" },
                          { value: "bool", label: "bool" },
                          { value: "color", label: "color" },
                          { value: "text", label: "text" },
                        ]}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const targetId = selectedNode.id;
                          const nextArgs = list.filter((_, i) => i !== idx);
                          mutateGraph((g) => ({
                            ...g,
                            nodes: g.nodes.map((n) =>
                              n.id === targetId
                                ? { ...n, params: { ...n.params, args: nextArgs } }
                                : n,
                            ),
                          }));
                          window.requestAnimationFrame(() => updateNodeInternals(targetId));
                        }}
                        title="删除参数"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--mk-status-error)]" />
                      </Button>
                    </div>
                  ))}
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
              </div>
            )}

            {selectedNode.kind === "scale_offset" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">比例 k</label>
                  <NumericParamInput
                    value={Number(selectedNode.params.k ?? 1)}
                    onCommit={(val) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, k: val } }
                            : n,
                        ),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">偏置 b</label>
                  <NumericParamInput
                    value={Number(selectedNode.params.b ?? 0)}
                    onCommit={(val) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, b: val } }
                            : n,
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {selectedNode.kind === "clamp" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">下限 lo</label>
                  <NumericParamInput
                    value={Number(selectedNode.params.lo ?? 0)}
                    onCommit={(val) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, lo: val } }
                            : n,
                        ),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">上限 hi</label>
                  <NumericParamInput
                    value={Number(selectedNode.params.hi ?? 1)}
                    onCommit={(val) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, hi: val } }
                            : n,
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {selectedNode.kind === "remap" && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["in_min", "输入下限"],
                    ["in_max", "输入上限"],
                    ["out_min", "输出下限"],
                    ["out_max", "输出上限"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[11px] text-[var(--mk-text-secondary)]">{label}</label>
                    <NumericParamInput
                      value={Number(selectedNode.params[key] ?? 0)}
                      onCommit={(val) =>
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, [key]: val } }
                              : n,
                          ),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedNode.kind === "threshold_color" && (
              <div className="space-y-2">
                <div className="text-[11px] text-[var(--mk-text-secondary)]">阈值分段 (&gt;= 阈值 → 颜色)</div>
                {(Array.isArray(selectedNode.params.steps)
                  ? (selectedNode.params.steps as Array<[number, string]>)
                  : []
                ).map(([th, col], idx, arr) => (
                  <div key={idx} className="flex items-center gap-1">
                    <NumericParamInput
                      value={Number(th ?? 0)}
                      className="w-20"
                      onCommit={(val) => {
                        const nextSteps = arr.map((s, i) => (i === idx ? [val, s[1]] : s));
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, steps: nextSteps } }
                              : n,
                          ),
                        }));
                      }}
                    />
                    <SimpleSelect
                      value={String(col ?? "green")}
                      className="flex-1"
                      onValueChange={(v) => {
                        const nextSteps = arr.map((s, i) => (i === idx ? [s[0], v] : s));
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, steps: nextSteps } }
                              : n,
                          ),
                        }));
                      }}
                      options={[...FLOW_COLOR_OPTIONS]}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const nextSteps = arr.filter((_, i) => i !== idx);
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, steps: nextSteps } }
                              : n,
                          ),
                        }));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--mk-status-error)]" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const prev = Array.isArray(selectedNode.params.steps)
                      ? (selectedNode.params.steps as Array<[number, string]>)
                      : [];
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, params: { ...n.params, steps: [...prev, [0.5, "yellow"]] } }
                          : n,
                      ),
                    }));
                  }}
                >
                  + 添加阈值段
                </Button>
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">兜底颜色 (else)</label>
                  <SimpleSelect
                    value={String(selectedNode.params.else ?? "pink")}
                    onValueChange={(v) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, else: v } }
                            : n,
                        ),
                      }))
                    }
                    options={[...FLOW_COLOR_OPTIONS]}
                  />
                </div>
              </div>
            )}

            {selectedNode.kind === "compare" && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">比较运算符 (op)</label>
                <SimpleSelect
                  value={String(selectedNode.params.op ?? "gt")}
                  onValueChange={(v) =>
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id ? { ...n, params: { ...n.params, op: v } } : n,
                      ),
                    }))
                  }
                  options={[
                    { value: "gt", label: "大于 (a > b)" },
                    { value: "gte", label: "大于等于 (a >= b)" },
                    { value: "lt", label: "小于 (a < b)" },
                    { value: "lte", label: "小于等于 (a <= b)" },
                    { value: "eq", label: "等于 (a == b)" },
                    { value: "neq", label: "不等于 (a != b)" },
                  ]}
                />
              </div>
            )}

            {selectedNode.kind === "logic" && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">逻辑运算 (op)</label>
                <SimpleSelect
                  value={String(selectedNode.params.op ?? "and")}
                  onValueChange={(v) => {
                    const targetId = selectedNode.id;
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === targetId ? { ...n, params: { ...n.params, op: v } } : n,
                      ),
                    }));
                    window.requestAnimationFrame(() => updateNodeInternals(targetId));
                  }}
                  options={[
                    { value: "and", label: "与 (a && b)" },
                    { value: "or", label: "或 (a || b)" },
                    { value: "not", label: "非 (!a)" },
                  ]}
                />
              </div>
            )}

            {selectedNode.kind === "edge" && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">检测方式 (mode)</label>
                <SimpleSelect
                  value={String(selectedNode.params.mode ?? "rising")}
                  onValueChange={(v) =>
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id ? { ...n, params: { ...n.params, mode: v } } : n,
                      ),
                    }))
                  }
                  options={[
                    { value: "rising", label: "上升沿 (0 → 1)" },
                    { value: "falling", label: "下降沿 (1 → 0)" },
                  ]}
                />
              </div>
            )}

            {selectedNode.kind === "text_select" && (
              <div className="space-y-2">
                <div className="text-[11px] text-[var(--mk-text-secondary)]">索引文本表 (cases[i])</div>
                {(Array.isArray(selectedNode.params.cases)
                  ? (selectedNode.params.cases as string[])
                  : []
                ).map((item, idx, arr) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="w-5 text-center font-mono text-[10px] text-[var(--mk-text-muted)]">
                      {idx}
                    </span>
                    <Input
                      value={String(item ?? "")}
                      className="h-7 flex-1 font-mono text-[11px]"
                      onChange={(e) => {
                        const nextCases = arr.map((c, i) => (i === idx ? e.target.value : c));
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, cases: nextCases } }
                              : n,
                          ),
                        }));
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const nextCases = arr.filter((_, i) => i !== idx);
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, cases: nextCases } }
                              : n,
                          ),
                        }));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--mk-status-error)]" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const prev = Array.isArray(selectedNode.params.cases)
                      ? (selectedNode.params.cases as string[])
                      : [];
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, params: { ...n.params, cases: [...prev, `STATE_${prev.length}`] } }
                          : n,
                      ),
                    }));
                  }}
                >
                  + 添加状态文本
                </Button>
                <div>
                  <label className="text-[11px] text-[var(--mk-text-secondary)]">越界兜底文本 (default)</label>
                  <Input
                    value={String(selectedNode.params.default ?? "")}
                    className="font-mono text-[11px]"
                    onChange={(e) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, default: e.target.value } }
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
                  onValueChange={(v) => {
                    const targetId = selectedNode.id;
                    const defaultVal =
                      v === "bool"
                        ? false
                        : v === "color"
                          ? "green"
                          : v === "text"
                            ? "TEXT"
                            : 0;
                    mutateGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) =>
                        n.id === targetId
                          ? { ...n, params: { ...n.params, type: v, value: defaultVal } }
                          : n,
                      ),
                    }));
                    window.requestAnimationFrame(() => updateNodeInternals(targetId));
                  }}
                  options={[
                    { value: "float", label: "float" },
                    { value: "int32", label: "int32" },
                    { value: "bool", label: "bool" },
                    { value: "color", label: "color" },
                    { value: "text", label: "text" },
                  ]}
                />
                {selectedNode.params.type === "bool" ? (
                  <label className="flex items-center justify-between rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2.5 py-1.5 text-xs">
                    <span>布尔值</span>
                    <Switch
                      checked={Boolean(selectedNode.params.value)}
                      onCheckedChange={(checked) =>
                        mutateGraph((g) => ({
                          ...g,
                          nodes: g.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, params: { ...n.params, value: checked } }
                              : n,
                          ),
                        }))
                      }
                    />
                  </label>
                ) : selectedNode.params.type === "color" ? (
                  <SimpleSelect
                    value={String(selectedNode.params.value ?? "green")}
                    onValueChange={(v) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, value: v } }
                            : n,
                        ),
                      }))
                    }
                    options={[...FLOW_COLOR_OPTIONS]}
                  />
                ) : selectedNode.params.type === "text" ? (
                  <Input
                    value={String(selectedNode.params.value ?? "")}
                    onChange={(e) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, value: e.target.value } }
                            : n,
                        ),
                      }))
                    }
                  />
                ) : (
                  <NumericParamInput
                    integer={selectedNode.params.type === "int32"}
                    value={Number(selectedNode.params.value ?? 0)}
                    onCommit={(val) =>
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, value: val } }
                            : n,
                        ),
                      }))
                    }
                  />
                )}
              </div>
            )}

            {(selectedNode.kind === "round_int" || selectedNode.kind === "mux") && (
              <div className="rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2.5 py-2 text-[11px] text-[var(--mk-text-muted)]">
                {selectedNode.kind === "round_int"
                  ? "无额外参数：将输入 float 四舍五入转换为 int32。"
                  : "无额外参数：按 cond ? a : b 自动推导并输出兼容类型。"}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">
                  节点参数 JSON（高级编辑）
                </label>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(jsonDraft);
                      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                        toast.error("节点参数必须是 JSON 对象");
                        return;
                      }
                      const targetId = selectedNode.id;
                      mutateGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === targetId
                            ? { ...n, params: parsed as Record<string, unknown> }
                            : n,
                        ),
                      }));
                      window.requestAnimationFrame(() => updateNodeInternals(targetId));
                      toast.success("已应用节点 JSON 参数");
                    } catch (err) {
                      toast.error("JSON 语法无效", {
                        description: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }}
                >
                  应用 JSON
                </Button>
              </div>
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full rounded border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-code)] p-2 font-mono text-[10px] text-[var(--mk-text-primary)] focus:border-[var(--mk-border-focus)] focus:outline-none"
              />
            </div>

            <Button
              variant="danger"
              size="sm"
              className="w-full"
              onClick={() => void deleteSelectedNodeOrEdges()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除当前节点 (Del)
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
