import { describe, expect, it } from "vitest";
import { validateFlowEdgeCandidate } from "../nodeRegistry";
import { createDefaultProfile, serializeProfileToToml } from "../profileSerializer";
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
});
