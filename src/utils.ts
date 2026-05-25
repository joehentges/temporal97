import {
  type BaseEdgeData,
  type EntityId,
  type EntryInput,
  type LogEntry,
  type Mutation,
  type MutationInput,
  MutationKindEnum,
  MutationOperationEnum,
  type Neighbor,
  type SnapshotId,
} from './temporal.types';

export interface Delta {
  nodes: {
    added: Set<EntityId>;
    updated: Set<EntityId>;
    removed: Set<EntityId>;
  };
  edges: {
    added: Set<EntityId>;
    updated: Set<EntityId>;
    removed: Set<EntityId>;
  };
}

// Creates a Delta with empty added/updated/removed sets for both nodes and edges.
export function emptyDelta(): Delta {
  return {
    nodes: { added: new Set(), updated: new Set(), removed: new Set() },
    edges: { added: new Set(), updated: new Set(), removed: new Set() },
  };
}

/**
 * Compares the current node/edge state against a pre-operation snapshot and returns a Delta
 * describing every entity that was added, updated, or removed during that operation.
 *
 * @param nodeState - Current live node state after the operation.
 * @param edgeState - Current live edge state after the operation.
 * @param preNodes - Set of node IDs that existed before the operation.
 * @param preEdges - Set of edge IDs that existed before the operation.
 * @param preNodeValues - Node values captured before the operation (used to detect updates).
 * @param preEdgeValues - Edge values captured before the operation (used to detect updates).
 */
export function diffAgainst<TNode, TEdge extends BaseEdgeData>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  preNodes: Set<EntityId>,
  preEdges: Set<EntityId>,
  preNodeValues: Map<EntityId, TNode>,
  preEdgeValues: Map<EntityId, TEdge>,
): Delta {
  const delta = emptyDelta();

  for (const id of nodeState.keys()) {
    if (!preNodes.has(id)) {
      delta.nodes.added.add(id);
    } else if (preNodeValues.get(id) !== nodeState.get(id)) {
      delta.nodes.updated.add(id);
    }
  }
  for (const id of preNodes) {
    if (!nodeState.has(id)) delta.nodes.removed.add(id);
  }
  for (const id of edgeState.keys()) {
    if (!preEdges.has(id)) {
      delta.edges.added.add(id);
    } else if (preEdgeValues.get(id) !== edgeState.get(id)) {
      delta.edges.updated.add(id);
    }
  }
  for (const id of preEdges) {
    if (!edgeState.has(id)) delta.edges.removed.add(id);
  }

  return delta;
}

/**
 * Registers an edge in the adjacency map for both its source and target nodes.
 * Creates the entry set for a node on first use.
 */
export function addAdjacency<TEdge extends BaseEdgeData>(
  adjacency: Map<EntityId, Set<EntityId>>,
  edgeId: EntityId,
  data: TEdge,
): void {
  let s = adjacency.get(data.source);
  if (!s) {
    s = new Set();
    adjacency.set(data.source, s);
  }
  s.add(edgeId);
  let t = adjacency.get(data.target);
  if (!t) {
    t = new Set();
    adjacency.set(data.target, t);
  }
  t.add(edgeId);
}

/**
 * Removes an edge from the adjacency map for both its source and target nodes.
 * Deletes the entry set entirely when it becomes empty.
 */
export function removeAdjacency<TEdge extends BaseEdgeData>(
  adjacency: Map<EntityId, Set<EntityId>>,
  edgeId: EntityId,
  data: TEdge,
): void {
  const s = adjacency.get(data.source);
  if (s) {
    s.delete(edgeId);
    if (s.size === 0) adjacency.delete(data.source);
  }
  const t = adjacency.get(data.target);
  if (t) {
    t.delete(edgeId);
    if (t.size === 0) adjacency.delete(data.target);
  }
}

/**
 * Yields a {@link Neighbor} for every edge currently connected to `nodeId` in the live graph.
 * For each adjacent edge ID found in `adjacency`, looks up the edge data in `edgeState` and
 * resolves the other endpoint. O(degree) — one Map lookup per adjacent edge.
 */
export function* resolveNeighbors<TEdge extends BaseEdgeData>(
  adjacency: Map<EntityId, Set<EntityId>>,
  edgeState: Map<EntityId, TEdge>,
  nodeId: EntityId,
): Generator<Neighbor<TEdge>> {
  const edgeIds = adjacency.get(nodeId);
  if (!edgeIds) return;
  for (const edgeId of edgeIds) {
    const edge = edgeState.get(edgeId);
    if (edge === undefined) continue;
    yield {
      nodeId: edge.source === nodeId ? edge.target : edge.source,
      edgeId,
      edge,
    };
  }
}

// Yields a Neighbor for every edge whose target is `nodeId` (i.e. edges pointing into this node).
export function* resolveInNeighbors<TEdge extends BaseEdgeData>(
  adjacency: Map<EntityId, Set<EntityId>>,
  edgeState: Map<EntityId, TEdge>,
  nodeId: EntityId,
): Generator<Neighbor<TEdge>> {
  const edgeIds = adjacency.get(nodeId);
  if (!edgeIds) return;
  for (const edgeId of edgeIds) {
    const edge = edgeState.get(edgeId);
    if (edge === undefined || edge.target !== nodeId) continue;
    yield { nodeId: edge.source, edgeId, edge };
  }
}

// Yields a Neighbor for every edge whose source is `nodeId` (i.e. edges going out from this node).
export function* resolveOutNeighbors<TEdge extends BaseEdgeData>(
  adjacency: Map<EntityId, Set<EntityId>>,
  edgeState: Map<EntityId, TEdge>,
  nodeId: EntityId,
): Generator<Neighbor<TEdge>> {
  const edgeIds = adjacency.get(nodeId);
  if (!edgeIds) return;
  for (const edgeId of edgeIds) {
    const edge = edgeState.get(edgeId);
    if (edge === undefined || edge.source !== nodeId) continue;
    yield { nodeId: edge.target, edgeId, edge };
  }
}

/**
 * Applies a single Set or Delete mutation to the live node/edge state, updates the adjacency
 * map for edge mutations, and records the change in `delta`.
 */
export function applyMutation<TNode, TEdge extends BaseEdgeData>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  adjacency: Map<EntityId, Set<EntityId>>,
  m: Mutation<TNode, TEdge>,
  delta: Delta,
): void {
  if (m.kind === MutationKindEnum.Node) {
    if (m.op === MutationOperationEnum.Set) {
      if (nodeState.has(m.id)) {
        delta.nodes.updated.add(m.id);
      } else {
        delta.nodes.added.add(m.id);
      }
      nodeState.set(m.id, m.value);
    } else {
      nodeState.delete(m.id);
      delta.nodes.removed.add(m.id);
    }
    return;
  }
  if (m.op === MutationOperationEnum.Set) {
    if (edgeState.has(m.id)) {
      delta.edges.updated.add(m.id);
    } else {
      delta.edges.added.add(m.id);
      addAdjacency(adjacency, m.id, m.value);
    }
    edgeState.set(m.id, m.value);
  } else {
    removeAdjacency(adjacency, m.id, m.prev);
    edgeState.delete(m.id);
    delta.edges.removed.add(m.id);
  }
}

/**
 * Same as `applyMutation` but skips delta tracking — used during bulk ingestion where a single
 * diff is computed over the whole batch rather than per-mutation.
 */
export function applyMutationNoDelta<TNode, TEdge extends BaseEdgeData>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  adjacency: Map<EntityId, Set<EntityId>>,
  m: Mutation<TNode, TEdge>,
): void {
  if (m.kind === MutationKindEnum.Node) {
    if (m.op === MutationOperationEnum.Set) {
      nodeState.set(m.id, m.value);
    } else {
      nodeState.delete(m.id);
    }
    return;
  }
  if (m.op === MutationOperationEnum.Set) {
    if (!edgeState.has(m.id)) {
      addAdjacency(adjacency, m.id, m.value);
    }
    edgeState.set(m.id, m.value);
  } else {
    removeAdjacency(adjacency, m.id, m.prev);
    edgeState.delete(m.id);
  }
}

/**
 * Undoes a single mutation by restoring the entity to its previous value.
 * For Set mutations, restores `prev` (or deletes the entity if it was newly created).
 * For Delete mutations, re-inserts the entity with its saved `prev` value.
 * Adjacency is updated when an edge's endpoints change or it is re-created/re-removed.
 */
export function reverseMutation<TNode, TEdge extends BaseEdgeData>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  adjacency: Map<EntityId, Set<EntityId>>,
  m: Mutation<TNode, TEdge>,
): void {
  if (m.kind === MutationKindEnum.Node) {
    if (m.op === MutationOperationEnum.Set) {
      if (m.prev === undefined) {
        nodeState.delete(m.id);
      } else {
        nodeState.set(m.id, m.prev);
      }
    } else {
      nodeState.set(m.id, m.prev);
    }
    return;
  }
  if (m.op === MutationOperationEnum.Set) {
    if (m.prev === undefined) {
      removeAdjacency(adjacency, m.id, m.value);
      edgeState.delete(m.id);
    } else {
      if (m.value.source !== m.prev.source || m.value.target !== m.prev.target) {
        removeAdjacency(adjacency, m.id, m.value);
        addAdjacency(adjacency, m.id, m.prev);
      }
      edgeState.set(m.id, m.prev);
    }
  } else {
    addAdjacency(adjacency, m.id, m.prev);
    edgeState.set(m.id, m.prev);
  }
}

// Applies every mutation in a log entry in order, accumulating changes into `delta`.
export function applyEntry<TNode, TEdge extends BaseEdgeData, TEvent>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  adjacency: Map<EntityId, Set<EntityId>>,
  entry: LogEntry<TNode, TEdge, TEvent>,
  delta: Delta,
): void {
  for (const m of entry.mutations) {
    applyMutation(nodeState, edgeState, adjacency, m, delta);
  }
}

// Applies every mutation in a log entry without tracking a delta — faster for bulk replay.
export function applyEntryNoDelta<TNode, TEdge extends BaseEdgeData, TEvent>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  adjacency: Map<EntityId, Set<EntityId>>,
  entry: LogEntry<TNode, TEdge, TEvent>,
): void {
  for (const m of entry.mutations) {
    applyMutationNoDelta(nodeState, edgeState, adjacency, m);
  }
}

/**
 * Undoes every mutation in a log entry in reverse order, stepping the graph state back by
 * one entry. Mutations are reversed last-to-first so dependent changes unwind correctly.
 */
export function reverseEntry<TNode, TEdge extends BaseEdgeData, TEvent>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  adjacency: Map<EntityId, Set<EntityId>>,
  entry: LogEntry<TNode, TEdge, TEvent>,
): void {
  for (let i = entry.mutations.length - 1; i >= 0; i -= 1) {
    const m = entry.mutations[i];
    if (m !== undefined) reverseMutation(nodeState, edgeState, adjacency, m);
  }
}

/**
 * Enriches a raw MutationInput with the entity's current value as `prev`, producing a fully
 * reversible Mutation. Throws if a Delete targets an entity that does not exist in the current state.
 */
export function materializeMutation<TNode, TEdge extends BaseEdgeData>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  m: MutationInput<TNode, TEdge>,
  snapshot: SnapshotId,
): Mutation<TNode, TEdge> {
  if (m.kind === MutationKindEnum.Node) {
    const prev = nodeState.get(m.id);
    if (m.op === MutationOperationEnum.Set) {
      return {
        kind: MutationKindEnum.Node,
        op: MutationOperationEnum.Set,
        id: m.id,
        value: m.value,
        prev,
      };
    }
    if (prev === undefined) {
      throw new Error(`Cannot delete node ${m.id}: not present at snapshot ${snapshot}.`);
    }
    return {
      kind: MutationKindEnum.Node,
      op: MutationOperationEnum.Delete,
      id: m.id,
      prev,
    };
  }
  const prev = edgeState.get(m.id);
  if (m.op === MutationOperationEnum.Set) {
    return {
      kind: MutationKindEnum.Edge,
      op: MutationOperationEnum.Set,
      id: m.id,
      value: m.value,
      prev,
    };
  }
  if (prev === undefined) {
    throw new Error(`Cannot delete edge ${m.id}: not present at snapshot ${snapshot}.`);
  }
  return {
    kind: MutationKindEnum.Edge,
    op: MutationOperationEnum.Delete,
    id: m.id,
    prev,
  };
}

/**
 * Converts an EntryInput into a LogEntry by materializing each mutation against the current
 * state, capturing `prev` values so every mutation can be reversed later.
 */
export function materializeEntry<TNode, TEdge extends BaseEdgeData, TEvent>(
  nodeState: Map<EntityId, TNode>,
  edgeState: Map<EntityId, TEdge>,
  input: EntryInput<TNode, TEdge, TEvent>,
): LogEntry<TNode, TEdge, TEvent> {
  const mutations: Mutation<TNode, TEdge>[] = [];
  for (const m of input.mutations) {
    mutations.push(materializeMutation(nodeState, edgeState, m, input.snapshot));
  }
  return {
    snapshot: input.snapshot,
    event: 'event' in input ? input.event : undefined,
    mutations,
  };
}

/**
 * Appends `entryIndex` to the history array for `id` in the given index map, creating the
 * array on first use. Keeps mutation history in insertion order.
 */
export function appendToHistoryIndex(
  index: Map<EntityId, number[]>,
  id: EntityId,
  entryIndex: number,
): void {
  let arr = index.get(id);
  if (!arr) {
    arr = [];
    index.set(id, arr);
  }
  arr.push(entryIndex);
}

/**
 * Registers a log entry in the node and edge history indexes so it can be looked up later by
 * entity ID. Edge mutations also touch their source and target nodes. If `options.eventEntityRefs`
 * is provided, any entity IDs returned by that callback for the entry's event are indexed too.
 */
export function indexEntry<TNode, TEdge extends BaseEdgeData, TEvent>(
  nodeHistory: Map<EntityId, number[]>,
  edgeHistory: Map<EntityId, number[]>,
  entry: LogEntry<TNode, TEdge, TEvent>,
  entryIndex: number,
): void {
  const touchedNodes = new Set<EntityId>();
  const touchedEdges = new Set<EntityId>();

  for (const m of entry.mutations) {
    if (m.kind === MutationKindEnum.Node) {
      touchedNodes.add(m.id);
    } else {
      touchedEdges.add(m.id);
      const data = m.op === MutationOperationEnum.Set ? m.value : m.prev;
      touchedNodes.add(data.source);
      touchedNodes.add(data.target);
    }
  }

  for (const id of touchedNodes) {
    appendToHistoryIndex(nodeHistory, id, entryIndex);
  }
  for (const id of touchedEdges) {
    appendToHistoryIndex(edgeHistory, id, entryIndex);
  }
}

/**
 * Binary search over a sorted entry array. Returns the index of the first entry whose snapshot
 * is >= `target`, or `entries.length` if all entries come before `target`.
 */
export function lowerBoundBySnapshot<TNode, TEdge extends BaseEdgeData, TEvent>(
  entries: LogEntry<TNode, TEdge, TEvent>[],
  target: SnapshotId,
): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const entry = entries[mid];
    if (entry !== undefined && entry.snapshot < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}
