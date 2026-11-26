import type { Edge, EdgeChangeset, Node, NodeChangeset } from "@xyflow/react";

/**
 * React Flow 画布运行时临时状态归类工具
 * 将 `dimensions`（节点测量尺寸）、`select` 与拖拽过程帧留在组件本地，
 * 避免与领域层 `FlowGraph` 互写导致 `measured` 丢失（`visibility: hidden`）及误标工程未保存。
 */

export interface NodeRuntimeMeta {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  dragging?: boolean;
  resizing?: boolean;
  dragPosition?: { x: number; y: number };
}

export function flowNodeRuntimeKey(flowId: string, nodeId: string): string {
  return `${flowId}:${nodeId}`;
}

export interface FlowNodeChangesetResult {
  nextRuntime: Record<string, NodeRuntimeMeta>;
  runtimeChanged: boolean;
  nextSelectedId: string | null;
  selectionChanged: boolean;
  removedIds: string[];
  committedPositions: Record<string, [number, number]>;
  shouldMutateGraph: boolean;
}

export function applyFlowNodeChangeset<T extends Record<string, unknown>>(params: {
  flowId: string;
  changes: NodeChangeset<Node<T>>;
  rfNodes: Node<T>[];
  currentRuntime: Record<string, NodeRuntimeMeta>;
  currentSelectedId: string | null;
}): FlowNodeChangesetResult {
  const { flowId, changes, rfNodes, currentRuntime, currentSelectedId } = params;
  const nextRf = changes.applyTo(rfNodes);
  const nextById = new Map(nextRf.map((n) => [n.id, n]));

  let nextRuntime = currentRuntime;
  let runtimeChanged = false;
  const ensureClonedRuntime = () => {
    if (!runtimeChanged) {
      nextRuntime = { ...currentRuntime };
      runtimeChanged = true;
    }
  };

  let nextSelectedId: string | null = currentSelectedId;
  let selectionChanged = false;
  const removedIds: string[] = [];
  const committedPositions: Record<string, [number, number]> = {};

  for (const change of changes) {
    switch (change.type) {
      case "dimensions": {
        const n = nextById.get(change.id);
        if (!n) break;
        const key = flowNodeRuntimeKey(flowId, change.id);
        const prev = nextRuntime[key];
        const nextWidth = n.width;
        const nextHeight = n.height;
        const nextMeasured = n.measured;
        const nextResizing = n.resizing;
        const changed =
          prev?.measured?.width !== nextMeasured?.width ||
          prev?.measured?.height !== nextMeasured?.height ||
          prev?.width !== nextWidth ||
          prev?.height !== nextHeight ||
          prev?.resizing !== nextResizing;
        if (changed) {
          ensureClonedRuntime();
          nextRuntime[key] = {
            ...prev,
            measured: nextMeasured,
            width: nextWidth,
            height: nextHeight,
            resizing: nextResizing,
          };
        }
        break;
      }
      case "position": {
        const n = nextById.get(change.id);
        const key = flowNodeRuntimeKey(flowId, change.id);
        const prev = nextRuntime[key];
        if (change.dragging === true) {
          const dragPos = n?.position
            ? { x: n.position.x, y: n.position.y }
            : prev?.dragPosition;
          ensureClonedRuntime();
          nextRuntime[key] = {
            ...prev,
            dragging: true,
            dragPosition: dragPos,
          };
        } else {
          if (prev?.dragging || prev?.dragPosition) {
            ensureClonedRuntime();
            const updated: NodeRuntimeMeta = { ...prev, dragging: false };
            delete updated.dragPosition;
            nextRuntime[key] = updated;
          }
          if (n) {
            committedPositions[change.id] = [
              Math.round(n.position.x),
              Math.round(n.position.y),
            ];
          }
        }
        break;
      }
      case "select": {
        const target = change.selected
          ? change.id
          : nextSelectedId === change.id
            ? null
            : nextSelectedId;
        if (target !== nextSelectedId) {
          nextSelectedId = target;
          selectionChanged = true;
        }
        break;
      }
      case "remove": {
        removedIds.push(change.id);
        const key = flowNodeRuntimeKey(flowId, change.id);
        if (nextRuntime[key] !== undefined) {
          ensureClonedRuntime();
          delete nextRuntime[key];
        }
        if (nextSelectedId === change.id) {
          nextSelectedId = null;
          selectionChanged = true;
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    nextRuntime,
    runtimeChanged,
    nextSelectedId,
    selectionChanged,
    removedIds,
    committedPositions,
    shouldMutateGraph:
      removedIds.length > 0 || Object.keys(committedPositions).length > 0,
  };
}

export interface FlowEdgeChangesetResult {
  nextRfEdges: Edge[];
  nextSelectedEdgeIds: Set<string>;
  selectionChanged: boolean;
  shouldMutateGraph: boolean;
}

export function applyFlowEdgeChangeset(params: {
  changes: EdgeChangeset<Edge>;
  rfEdges: Edge[];
  currentSelectedEdgeIds: Set<string>;
}): FlowEdgeChangesetResult {
  const { changes, rfEdges, currentSelectedEdgeIds } = params;
  const nextRfEdges = changes.applyTo(rfEdges);

  let nextSelectedEdgeIds = currentSelectedEdgeIds;
  let selectionChanged = false;
  let shouldMutateGraph = false;

  const ensureClonedSelection = () => {
    if (!selectionChanged) {
      nextSelectedEdgeIds = new Set(currentSelectedEdgeIds);
      selectionChanged = true;
    }
  };

  for (const change of changes) {
    switch (change.type) {
      case "select": {
        ensureClonedSelection();
        if (change.selected) {
          nextSelectedEdgeIds.add(change.id);
        } else {
          nextSelectedEdgeIds.delete(change.id);
        }
        break;
      }
      case "remove": {
        if (currentSelectedEdgeIds.has(change.id) || selectionChanged) {
          ensureClonedSelection();
          nextSelectedEdgeIds.delete(change.id);
        }
        shouldMutateGraph = true;
        break;
      }
      case "add":
      case "replace": {
        shouldMutateGraph = true;
        break;
      }
      default:
        break;
    }
  }

  return {
    nextRfEdges,
    nextSelectedEdgeIds,
    selectionChanged,
    shouldMutateGraph,
  };
}
