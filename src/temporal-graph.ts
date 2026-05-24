import {
  type BaseEdgeData,
  type EntityId,
  type EntryInput,
  type LogEntry,
  MutationKindEnum,
  MutationOperationEnum,
  type Neighbor,
  type SnapshotId,
  type TemporalGraphOptions,
} from './temporal.types';

import {
  applyEntry,
  applyEntryNoDelta,
  type Delta,
  diffAgainst,
  emptyDelta,
  indexEntry,
  lowerBoundBySnapshot,
  materializeEntry,
  resolveNeighbors,
  reverseEntry,
} from './utils';

const EMPTY_SET: ReadonlySet<EntityId> = new Set();

export class TemporalGraph<
  TNode = unknown,
  TEdge extends BaseEdgeData = BaseEdgeData,
  TEvent = unknown,
> {
  private entries: LogEntry<TNode, TEdge, TEvent>[] = [];

  private nodeState = new Map<EntityId, TNode>();
  private edgeState = new Map<EntityId, TEdge>();

  private adjacency = new Map<EntityId, Set<EntityId>>();

  private nodeHistory = new Map<EntityId, number[]>();
  private edgeHistory = new Map<EntityId, number[]>();

  private cursorIndex = 0;

  private options: TemporalGraphOptions<TEvent>;

  constructor(options: TemporalGraphOptions<TEvent> = {}) {
    this.options = options;
  }

  hasNode(id: EntityId): boolean {
    return this.nodeState.has(id);
  }

  getNode(id: EntityId): TNode | undefined {
    return this.nodeState.get(id);
  }

  // Returns the value of a node at a specific snapshot, or `undefined` if it did not exist at that snapshot.
  getNodeAt(id: EntityId, snapshot: SnapshotId): TNode | undefined {
    const history = this.getNodeHistory(id);
    let result: TNode | undefined;
    for (const record of history) {
      if (record.snapshot > snapshot) break;
      result = record.value;
    }
    return result;
  }

  hasEdge(id: EntityId): boolean {
    return this.edgeState.has(id);
  }

  getEdge(id: EntityId): TEdge | undefined {
    return this.edgeState.get(id);
  }

  // Returns the value of an edge at a specific snapshot, or `undefined` if it did not exist at that snapshot.
  getEdgeAt(edgeId: EntityId, snapshot: SnapshotId): TEdge | undefined {
    const indices = this.edgeHistory.get(edgeId);
    if (!indices) return undefined;
    return this.getEdgeValueAt(edgeId, indices, snapshot);
  }

  // Returns the set of edge IDs connected to `id` (as both source or target) at the current snapshot.
  getEdgesForNode(id: EntityId): ReadonlySet<EntityId> {
    return this.adjacency.get(id) ?? EMPTY_SET;
  }

  /**
   * Returns an iterator over every neighbor of `id` at the current snapshot. Each item describes
   * the neighboring node ID, the connecting edge ID, and the full edge data — giving traversal
   * algorithms everything they need in a single call without manual edge lookups.
   *
   * For directed traversal, filter by `edge.source === id` (outbound) or `edge.target === id` (inbound).
   */
  getNeighbors(id: EntityId): IterableIterator<Neighbor<TEdge>> {
    return resolveNeighbors(this.adjacency, this.edgeState, id);
  }

  /**
   * Returns every neighbor of `id` as it existed at `snapshot`. Scans edge history in a single
   * pass to find edges that were alive and connected to `id` at that point in time, returning
   * the edge value and resolved neighbor ID for each.
   *
   * Use this when running traversal algorithms over a historical state of the graph rather than
   * the current live state. Pair with {@link getNodeAt} to read node data at the same snapshot.
   */
  getNeighborsAt(id: EntityId, snapshot: SnapshotId): ReadonlyArray<Neighbor<TEdge>> {
    const result: Neighbor<TEdge>[] = [];
    for (const [edgeId, indices] of this.edgeHistory) {
      const edge = this.getEdgeValueAt(edgeId, indices, snapshot);
      if (edge !== undefined && (edge.source === id || edge.target === id)) {
        result.push({
          nodeId: edge.source === id ? edge.target : edge.source,
          edgeId,
          edge,
        });
      }
    }
    return result;
  }

  // Scans an edge's mutation history up to `snapshot` and returns its value at that point, or
  // `undefined` if it did not exist or had been deleted.
  private getEdgeValueAt(
    edgeId: EntityId,
    indices: number[],
    snapshot: SnapshotId,
  ): TEdge | undefined {
    let result: TEdge | undefined;
    for (const idx of indices) {
      const entry = this.entries[idx];
      if (entry === undefined || entry.snapshot > snapshot) break;
      for (const mutation of entry.mutations) {
        if (mutation.kind !== MutationKindEnum.Edge || mutation.id !== edgeId) continue;
        result = mutation.op === MutationOperationEnum.Set ? mutation.value : undefined;
      }
    }
    return result;
  }

  // Helper for getEdgesForNodeAt: checks if edge `edgeId` is alive and connected to `nodeId` at `snapshot` by scanning through the edge's mutation history.
  private isEdgeAliveAndConnectedAt(
    edgeId: EntityId,
    indices: number[],
    nodeId: EntityId,
    snapshot: SnapshotId,
  ): boolean {
    let alive = false;
    let connected = false;
    for (const idx of indices) {
      const entry = this.entries[idx];
      if (entry === undefined || entry.snapshot > snapshot) break;
      for (const mutation of entry.mutations) {
        if (mutation.kind !== MutationKindEnum.Edge || mutation.id !== edgeId) continue;
        if (mutation.op === MutationOperationEnum.Set) {
          alive = true;
          connected = mutation.value.source === nodeId || mutation.value.target === nodeId;
        } else {
          alive = false;
        }
      }
    }
    return alive && connected;
  }

  // Returns the set of edge IDs connected to `id` (as both source or target) at a specific snapshot.
  getEdgesForNodeAt(id: EntityId, snapshot: SnapshotId): ReadonlySet<EntityId> {
    const result = new Set<EntityId>();
    for (const [edgeId, indices] of this.edgeHistory) {
      if (this.isEdgeAliveAndConnectedAt(edgeId, indices, id, snapshot)) {
        result.add(edgeId);
      }
    }
    return result;
  }

  // Returns all snapshots in the log, each paired with the entries recorded at that snapshot.
  getSnapshots(): {
    snapshot: SnapshotId;
    entries: LogEntry<TNode, TEdge, TEvent>[];
  }[] {
    const result: {
      snapshot: SnapshotId;
      entries: LogEntry<TNode, TEdge, TEvent>[];
    }[] = [];
    let currentSnapshot: SnapshotId | undefined;

    for (const entry of this.entries) {
      if (entry.snapshot !== currentSnapshot) {
        currentSnapshot = entry.snapshot;
        result.push({ snapshot: currentSnapshot, entries: [] });
      }
      result[result.length - 1]?.entries.push(entry);
    }

    return result;
  }

  // Returns an ordered list of every unique snapshot ID in the log.
  getSnapshotIds(): SnapshotId[] {
    const result: SnapshotId[] = [];
    let current: SnapshotId | undefined;
    for (const entry of this.entries) {
      if (entry.snapshot !== current) {
        current = entry.snapshot;
        result.push(current);
      }
    }
    return result;
  }

  // The snapshot ID at the current cursor position. Returns `-Infinity` when the graph is at its initial (empty) state.
  get currentSnapshot(): SnapshotId {
    return this.entries[this.cursorIndex - 1]?.snapshot ?? -Infinity;
  }

  // The number of nodes currently alive at the cursor position.
  get nodeCount(): number {
    return this.nodeState.size;
  }

  // The number of edges currently alive at the cursor position.
  get edgeCount(): number {
    return this.edgeState.size;
  }

  // Total number of log entries stored across all snapshots, regardless of cursor position.
  get entryCount(): number {
    return this.entries.length;
  }

  // Iterates over all `[id, data]` pairs for nodes that are alive at the current snapshot.
  liveNodes(): IterableIterator<[EntityId, TNode]> {
    return this.nodeState.entries();
  }

  // Iterates over all `[id, data]` pairs for edges that are alive at the current snapshot.
  liveEdges(): IterableIterator<[EntityId, TEdge]> {
    return this.edgeState.entries();
  }

  // Returns an object with iterators for live nodes and edges, plus all events attached to the current snapshot.
  getLiveSnapshot() {
    return {
      nodes: this.liveNodes(),
      edges: this.liveEdges(),
      events: this.getEventsAt(this.currentSnapshot),
    };
  }

  /**
   * Appends a single entry at the head of the log, applies its mutations to the live state,
   * and returns a Delta describing what changed.
   * @throws If the cursor is not at head (call `seekTo` first) or if the snapshot goes backwards.
   */
  append(input: EntryInput<TNode, TEdge, TEvent>): Delta {
    if (this.cursorIndex !== this.entries.length) {
      throw new Error('append() requires the cursor to be at head. Call seekTo(head) first.');
    }
    if (input.snapshot < this.currentSnapshot) {
      throw new Error(
        `append() snapshot ${input.snapshot} is before current ${this.currentSnapshot}.`,
      );
    }

    const entry = materializeEntry(this.nodeState, this.edgeState, input);
    const entryIndex = this.entries.length;
    this.entries.push(entry);

    const delta = emptyDelta();
    applyEntry(this.nodeState, this.edgeState, this.adjacency, entry, delta);
    indexEntry(this.nodeHistory, this.edgeHistory, this.options, entry, entryIndex);
    this.cursorIndex = this.entries.length;
    return delta;
  }

  /**
   * Bulk-appends a pre-sorted array of entries at the head of the log and returns a single Delta
   * covering the net effect of the entire batch. Prefer over repeated `append` calls when loading
   * many entries at once, as it computes only one diff for the whole set.
   * @throws If the cursor is not at head or if entries are not sorted in ascending snapshot order.
   */
  ingest(inputs: EntryInput<TNode, TEdge, TEvent>[]): Delta {
    if (this.cursorIndex !== this.entries.length) {
      throw new Error('ingest() requires the cursor to be at head.');
    }

    const preNodes = new Set(this.nodeState.keys());
    const preEdges = new Set(this.edgeState.keys());
    const preNodeValues = new Map(this.nodeState);
    const preEdgeValues = new Map(this.edgeState);

    let lastSnapshot = this.currentSnapshot;
    for (const input of inputs) {
      if (input.snapshot < lastSnapshot) {
        throw new Error(
          `ingest() entries must be sorted by snapshot. Got ${input.snapshot} after ${lastSnapshot}.`,
        );
      }
      lastSnapshot = input.snapshot;
      const entry = materializeEntry(this.nodeState, this.edgeState, input);
      const entryIndex = this.entries.length;
      this.entries.push(entry);
      applyEntryNoDelta(this.nodeState, this.edgeState, this.adjacency, entry);
      indexEntry(this.nodeHistory, this.edgeHistory, this.options, entry, entryIndex);
    }
    this.cursorIndex = this.entries.length;

    return diffAgainst(
      this.nodeState,
      this.edgeState,
      preNodes,
      preEdges,
      preNodeValues,
      preEdgeValues,
    );
  }

  /**
   * Moves the cursor forward to `targetSnapshot`, applying all entries up to and including that
   * snapshot. Returns a Delta describing what changed.
   * @throws If `targetSnapshot` is before the current snapshot — use `rewind()` or `seekTo()` instead.
   */
  advance(targetSnapshot: SnapshotId): Delta {
    if (targetSnapshot < this.currentSnapshot) {
      throw new Error('advance() target is before current. Use rewind() or seekTo().');
    }

    const preNodes = new Set(this.nodeState.keys());
    const preEdges = new Set(this.edgeState.keys());
    const preNodeValues = new Map(this.nodeState);
    const preEdgeValues = new Map(this.edgeState);

    while (this.cursorIndex < this.entries.length) {
      const entry = this.entries[this.cursorIndex];
      if (entry === undefined || entry.snapshot > targetSnapshot) break;
      applyEntryNoDelta(this.nodeState, this.edgeState, this.adjacency, entry);
      this.cursorIndex += 1;
    }

    return diffAgainst(
      this.nodeState,
      this.edgeState,
      preNodes,
      preEdges,
      preNodeValues,
      preEdgeValues,
    );
  }

  /**
   * Moves the cursor backward to `targetSnapshot` by undoing entries in reverse, restoring the
   * graph to the state it was in at that snapshot. Returns a Delta describing what changed.
   * @throws If `targetSnapshot` is after the current snapshot — use `advance()` or `seekTo()` instead.
   */
  rewind(targetSnapshot: SnapshotId): Delta {
    if (targetSnapshot > this.currentSnapshot) {
      throw new Error('rewind() target is after current. Use advance() or seekTo().');
    }

    const preNodes = new Set(this.nodeState.keys());
    const preEdges = new Set(this.edgeState.keys());
    const preNodeValues = new Map(this.nodeState);
    const preEdgeValues = new Map(this.edgeState);

    while (this.cursorIndex > 0) {
      const entry = this.entries[this.cursorIndex - 1];
      if (entry === undefined || entry.snapshot <= targetSnapshot) break;
      reverseEntry(this.nodeState, this.edgeState, this.adjacency, entry);
      this.cursorIndex -= 1;
    }

    return diffAgainst(
      this.nodeState,
      this.edgeState,
      preNodes,
      preEdges,
      preNodeValues,
      preEdgeValues,
    );
  }

  /**
   * Moves the cursor to any snapshot — forward or backward — by delegating to `advance()` or
   * `rewind()` as appropriate. The general-purpose alternative to calling either directly.
   */
  seekTo(targetSnapshot: SnapshotId): Delta {
    if (targetSnapshot >= this.currentSnapshot) {
      return this.advance(targetSnapshot);
    }
    return this.rewind(targetSnapshot);
  }

  // Returns all log entries recorded at exactly `snapshot`, regardless of current cursor position.
  getEntriesBySnapshot(snapshot: SnapshotId): LogEntry<TNode, TEdge, TEvent>[] {
    if (this.entries.length === 0) return [];
    const start = lowerBoundBySnapshot(this.entries, snapshot);
    const result: LogEntry<TNode, TEdge, TEvent>[] = [];
    for (let i = start; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      if (entry === undefined || entry.snapshot !== snapshot) break;
      result.push(entry);
    }
    return result;
  }

  /**
   * Returns every log entry that mutated node `id` or referenced it via a connected edge.
   * Useful for auditing the full history of a node across all snapshots.
   */
  getEntriesTouching(id: EntityId): LogEntry<TNode, TEdge, TEvent>[] {
    const indices = this.nodeHistory.get(id);
    if (!indices) return [];
    const result: LogEntry<TNode, TEdge, TEvent>[] = [];
    for (const idx of indices) {
      const entry = this.entries[idx];
      if (entry !== undefined) result.push(entry);
    }
    return result;
  }

  // Returns every log entry that mutated edge `id` across all snapshots.
  getEntriesTouchingEdge(id: EntityId): LogEntry<TNode, TEdge, TEvent>[] {
    const indices = this.edgeHistory.get(id);
    if (!indices) return [];
    const result: LogEntry<TNode, TEdge, TEvent>[] = [];
    for (const idx of indices) {
      const entry = this.entries[idx];
      if (entry !== undefined) result.push(entry);
    }
    return result;
  }

  // Returns all log entries whose snapshot falls within the inclusive range `[from, to]`.
  getEntriesBetween(from: SnapshotId, to: SnapshotId): LogEntry<TNode, TEdge, TEvent>[] {
    if (this.entries.length === 0 || from > to) return [];
    const start = lowerBoundBySnapshot(this.entries, from);
    const result: LogEntry<TNode, TEdge, TEvent>[] = [];
    for (let i = start; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      if (entry === undefined || entry.snapshot > to) break;
      result.push(entry);
    }
    return result;
  }

  // Returns the event payloads attached to entries recorded at exactly `snapshot`.
  getEventsAt(snapshot: SnapshotId): TEvent[] {
    if (this.entries.length === 0) return [];
    const start = lowerBoundBySnapshot(this.entries, snapshot);
    const result: TEvent[] = [];
    for (let i = start; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      if (entry === undefined || entry.snapshot !== snapshot) break;
      if (entry.event !== undefined) result.push(entry.event);
    }
    return result;
  }

  /**
   * Returns every Set value recorded for node `id` across all snapshots, in chronological order.
   * Each entry pairs a snapshot ID with the value the node held after that mutation.
   */
  getNodeHistory(id: EntityId): Array<{ snapshot: SnapshotId; value: TNode }> {
    const indices = this.nodeHistory.get(id);
    if (!indices) return [];
    const result: Array<{ snapshot: SnapshotId; value: TNode }> = [];
    for (const idx of indices) {
      const entry = this.entries[idx];
      if (entry === undefined) continue;
      for (const mutation of entry.mutations) {
        if (
          mutation.kind === MutationKindEnum.Node &&
          mutation.id === id &&
          mutation.op === MutationOperationEnum.Set
        ) {
          result.push({ snapshot: entry.snapshot, value: mutation.value });
        }
      }
    }
    return result;
  }
}
