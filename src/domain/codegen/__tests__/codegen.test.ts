import { describe, expect, it } from "vitest";
import { EdgeChangeset, NodeChangeset, type Edge, type Node } from "@xyflow/react";
import {
  applyFlowEdgeChangeset,
  applyFlowNodeChangeset,
  flowNodeRuntimeKey,
} from "../flowCanvasState";
import { validateFlowEdgeCandidate } from "../nodeRegistry";
import {
  createDefaultProfile,
  parseCFileFallback,
  serializeProfileToToml,
  sliceUtf8Bytes,
  upsertCodeNodeFallback,
  validateProfileLightweight,
} from "../profileSerializer";
import { collectGraphicTargetOptions, type FlowGraph } from "../types";
import { createDocumentFromTemplate } from "@/domain/templates/starterTemplates";

describe("codegen profile & graph helpers", () => {
  it("serializes profile deterministically with sections, transport and flows", () => {
    const profile = createDefaultProfile();
    profile.frames = ["main"];
    profile.start_frame = "main";
    profile.symbols = [
      {
        id: "cap_pct",
        label: "电容比例",
        type: "float",
        ref: { symbol: "g_cap_pct", lang: "c", include: "supercap.h" },
      },
    ];
    profile.transport.send = {
      symbol: "Referee_SendUI",
      lang: "c",
      include: "referee.h",
    };
    profile.flows = {
      main: {
        nodes: [
          { id: "n1", kind: "symbol_source", ref: "symbol:cap_pct", params: {}, position: [40, 80] },
          { id: "n2", kind: "graphic_sink", ref: "cap_bar.percent", params: {}, position: [340, 80] },
        ],
        edges: [{ id: "e1", from: "n1.out", to: "n2.in" }],
      },
    };

    const toml1 = serializeProfileToToml(profile);
    const toml2 = serializeProfileToToml(profile);

    expect(toml1).toBe(toml2);
    expect(toml1).toContain('schema = 1');
    expect(toml1).toContain('start_frame = "main"');
    expect(toml1).toContain('[[symbols]]');
    expect(toml1).toContain('symbol = "g_cap_pct"');
    expect(toml1).toContain('[flows.main]');
    expect(toml1).toContain('from = "n1.out"');
  });

  it("collects graphic target options from document", () => {
    const doc = createDocumentFromTemplate("infantry_combat", "unit_test", "infantry_3");
    const opts = collectGraphicTargetOptions(doc);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.target.endsWith(".color") && o.valueType === "color")).toBe(true);
    expect(opts.some((o) => o.target.endsWith(".visible") && o.valueType === "bool")).toBe(true);
  });

  it("rejects cyclic edges and incompatible port types in flow graph", () => {
    const graph: FlowGraph = {
      nodes: [
        { id: "src_float", kind: "symbol_source", ref: "symbol:cap", params: {} },
        { id: "scale", kind: "scale_offset", params: { k: 1, b: 0 } },
        { id: "sink_text", kind: "graphic_sink", ref: "lbl.text", params: {} },
      ],
      edges: [{ from: "src_float.out", to: "scale.in" }],
    };

    const opts = {
      symbolTypes: { cap: "float" as const },
      targetTypes: { "lbl.text": "text" as const },
    };

    // float -> text must fail
    const badType = validateFlowEdgeCandidate(
      graph,
      { from: "scale.out", to: "sink_text.in" },
      opts,
    );
    expect(badType.valid).toBe(false);
    expect(badType.reason).toContain("类型不匹配");

    // scale -> src_float creates a cycle (if src_float had input) or scale -> scale self-loop
    const selfLoop = validateFlowEdgeCandidate(
      graph,
      { from: "scale.out", to: "scale.in" },
      opts,
    );
    expect(selfLoop.valid).toBe(false);
    expect(selfLoop.reason).toContain("环路");
  });

  it("preserves measured dimensions without mutating FlowGraph and commits final drag position", () => {
    const rfNodes: Node<{ label: string }>[] = [
      { id: "n1", position: { x: 100, y: 120 }, data: { label: "Node 1" } },
      { id: "n2", position: { x: 320, y: 120 }, data: { label: "Node 2" } },
    ];

    const dimChanges = new NodeChangeset<Node<{ label: string }>>([
      { id: "n1", type: "dimensions", dimensions: { width: 210, height: 84 } },
    ]);
    const dimRes = applyFlowNodeChangeset({
      flowId: "main",
      changes: dimChanges,
      rfNodes,
      currentRuntime: {},
      currentSelectedId: null,
    });
    expect(dimRes.shouldMutateGraph).toBe(false);
    expect(dimRes.runtimeChanged).toBe(true);
    expect(dimRes.nextRuntime[flowNodeRuntimeKey("main", "n1")]?.measured).toEqual({
      width: 210,
      height: 84,
    });

    const selectChanges = new NodeChangeset<Node<{ label: string }>>([
      { id: "n1", type: "select", selected: true },
    ]);
    const selRes = applyFlowNodeChangeset({
      flowId: "main",
      changes: selectChanges,
      rfNodes,
      currentRuntime: dimRes.nextRuntime,
      currentSelectedId: null,
    });
    expect(selRes.shouldMutateGraph).toBe(false);
    expect(selRes.selectionChanged).toBe(true);
    expect(selRes.nextSelectedId).toBe("n1");

    const dragChanges = new NodeChangeset<Node<{ label: string }>>([
      { id: "n1", type: "position", dragging: true, position: { x: 145.6, y: 199.2 } },
    ]);
    const dragRes = applyFlowNodeChangeset({
      flowId: "main",
      changes: dragChanges,
      rfNodes,
      currentRuntime: selRes.nextRuntime,
      currentSelectedId: selRes.nextSelectedId,
    });
    expect(dragRes.shouldMutateGraph).toBe(false);
    expect(dragRes.nextRuntime[flowNodeRuntimeKey("main", "n1")]?.dragPosition).toEqual({
      x: 145.6,
      y: 199.2,
    });

    const dropChanges = new NodeChangeset<Node<{ label: string }>>([
      { id: "n1", type: "position", dragging: false, position: { x: 145.6, y: 199.2 } },
    ]);
    const dropRes = applyFlowNodeChangeset({
      flowId: "main",
      changes: dropChanges,
      rfNodes,
      currentRuntime: dragRes.nextRuntime,
      currentSelectedId: dragRes.nextSelectedId,
    });
    expect(dropRes.shouldMutateGraph).toBe(true);
    expect(dropRes.committedPositions).toEqual({ n1: [146, 199] });
    expect(dropRes.nextRuntime[flowNodeRuntimeKey("main", "n1")]?.dragPosition).toBeUndefined();

    const removeChanges = new NodeChangeset<Node<{ label: string }>>([
      { id: "n1", type: "remove" },
    ]);
    const rmRes = applyFlowNodeChangeset({
      flowId: "main",
      changes: removeChanges,
      rfNodes,
      currentRuntime: dropRes.nextRuntime,
      currentSelectedId: "n1",
    });
    expect(rmRes.shouldMutateGraph).toBe(true);
    expect(rmRes.removedIds).toEqual(["n1"]);
    expect(rmRes.nextSelectedId).toBeNull();
    expect(rmRes.nextRuntime[flowNodeRuntimeKey("main", "n1")]).toBeUndefined();
  });

  it("handles edge selection locally and only mutates FlowGraph on structural edge changes", () => {
    const rfEdges: Edge[] = [{ id: "e1", source: "n1", target: "n2" }];

    const selEdge = new EdgeChangeset<Edge>([{ id: "e1", type: "select", selected: true }]);
    const selRes = applyFlowEdgeChangeset({
      changes: selEdge,
      rfEdges,
      currentSelectedEdgeIds: new Set(),
    });
    expect(selRes.shouldMutateGraph).toBe(false);
    expect(selRes.selectionChanged).toBe(true);
    expect(selRes.nextSelectedEdgeIds.has("e1")).toBe(true);

    const rmEdge = new EdgeChangeset<Edge>([{ id: "e1", type: "remove" }]);
    const rmRes = applyFlowEdgeChangeset({
      changes: rmEdge,
      rfEdges,
      currentSelectedEdgeIds: selRes.nextSelectedEdgeIds,
    });
    expect(rmRes.shouldMutateGraph).toBe(true);
    expect(rmRes.nextRfEdges).toEqual([]);
    expect(rmRes.nextSelectedEdgeIds.size).toBe(0);
  });

  it("slices UTF-8 byte offsets accurately with Chinese comments and quotes non-ASCII flow IDs", () => {
    const cSrc = `/* 中文注释 */\nfloat mk_test(float x) {\n    return x * 2.0f;\n}\n`;
    const parsed = parseCFileFallback("nodes.c", cSrc, "mk_hud");
    expect(parsed.functions).toHaveLength(1);
    const body = sliceUtf8Bytes(
      cSrc,
      parsed.functions[0].bodyStartByte,
      parsed.functions[0].bodyEndByte,
    );
    expect(body).toContain("return x * 2.0f;");

    const upserted = upsertCodeNodeFallback("nodes.c", cSrc, "mk_hud", {
      name: "mk_test",
      originalName: "mk_test",
      returnType: "int32",
      params: [{ name: "n", type: "int32" }],
      body: "return n + 1;",
    });
    expect(upserted.parsed.functions[0].portReturn).toBe("int32");

    const p = createDefaultProfile();
    p.prefix = "";
    p.flows = { "主流程 1": { nodes: [], edges: [] } };
    expect(serializeProfileToToml(p)).toContain('[flows."主流程 1"]');
    expect(validateProfileLightweight(p).some((d) => d.code === "PROFILE_INVALID_PREFIX")).toBe(true);
  });
});
