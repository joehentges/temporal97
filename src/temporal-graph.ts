import {
  CursorNotAtHeadError,
  SeekDirectionError,
  SnapshotOrderError,
  UnsupportedVersionError,
} from './errors';
import {
  type BaseEdgeData,
  type EntityId,
  type EntryInput,
  type LogEntry,
  MutationKindEnum,
  MutationOperationEnum,
  type Neighbor,
  type SerializedTemporalGraph,
  type SnapshotId,
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
  resolveInNeighbors,
  resolveNeighbors,
  resolveOutNeighbors,
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

  hasNode(id: EntityId): boolean {
    return this.nodeState.has(id);
  }

  getNode(id: EntityId): TNode | undefined {
    return this.nodeState.get(id);
  }

  // Returns the value of a node at a specific snapshot, or `undefined` if it did not exist at that snapshot.
  getNodeAt(id: EntityId, snapshot: SnapshotId): TNode | undefined {
    const indices = this.nodeHistory.get(id);
    if (!indices) return undefined;
    let result: TNode | undefined;
    for (const idx of indices) {
      const entry = this.entries[idx];
      if (entry === undefined || entry.snapshot > snapshot) break;
      for (const mutation of entry.mutations) {
        if (mutation.kind !== MutationKindEnum.Node || mutation.id !== id) continue;
        result = mutation.op === MutationOperationEnum.Set ? mutation.value : undefined;
      }
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
   * For directed traversal use {@link inNeighbors} or {@link outNeighbors} instead.
   */
  getNeighbors(id: EntityId): IterableIterator<Neighbor<TEdge>> {
    return resolveNeighbors(this.adjacency, this.edgeState, id);
  }

  // Returns an iterator over every neighbor that has an edge pointing into `id` at the current snapshot.
  inNeighbors(id: EntityId): IterableIterator<Neighbor<TEdge>> {
    return resolveInNeighbors(this.adjacency, this.edgeState, id);
  }

  // Returns an iterator over every neighbor that `id` has an outgoing edge to at the current snapshot.
  outNeighbors(id: EntityId): IterableIterator<Neighbor<TEdge>> {
    return resolveOutNeighbors(this.adjacency, this.edgeState, id);
  }

  // Total number of edges connected to `id` (in + out) at the current snapshot.
  degree(id: EntityId): number {
    return this.adjacency.get(id)?.size ?? 0;
  }

  // Number of edges whose target is `id` at the current snapshot.
  inDegree(id: EntityId): number {
    const edgeIds = this.adjacency.get(id);
    if (!edgeIds) return 0;
    let count = 0;
    for (const edgeId of edgeIds) {
      if (this.edgeState.get(edgeId)?.target === id) count += 1;
    }
    return count;
  }

  // Number of edges whose source is `id` at the current snapshot.
  outDegree(id: EntityId): number {
    const edgeIds = this.adjacency.get(id);
    if (!edgeIds) return 0;
    let count = 0;
    for (const edgeId of edgeIds) {
      if (this.edgeState.get(edgeId)?.source === id) count += 1;
    }
    return count;
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
      throw new CursorNotAtHeadError('append');
    }
    if (input.snapshot < this.currentSnapshot) {
      throw new SnapshotOrderError('append', input.snapshot, this.currentSnapshot);
    }

    const entry = materializeEntry(this.nodeState, this.edgeState, input);
    const entryIndex = this.entries.length;
    this.entries.push(entry);

    const delta = emptyDelta();
    applyEntry(this.nodeState, this.edgeState, this.adjacency, entry, delta);
    indexEntry(this.nodeHistory, this.edgeHistory, entry, entryIndex);
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
      throw new CursorNotAtHeadError('ingest');
    }

    const preNodes = new Set(this.nodeState.keys());
    const preEdges = new Set(this.edgeState.keys());
    const preNodeValues = new Map(this.nodeState);
    const preEdgeValues = new Map(this.edgeState);

    let lastSnapshot = this.currentSnapshot;
    for (const input of inputs) {
      if (input.snapshot < lastSnapshot) {
        throw new SnapshotOrderError('ingest', input.snapshot, lastSnapshot);
      }
      lastSnapshot = input.snapshot;
      const entry = materializeEntry(this.nodeState, this.edgeState, input);
      const entryIndex = this.entries.length;
      this.entries.push(entry);
      applyEntryNoDelta(this.nodeState, this.edgeState, this.adjacency, entry);
      indexEntry(this.nodeHistory, this.edgeHistory, entry, entryIndex);
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
      throw new SeekDirectionError('advance');
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
      throw new SeekDirectionError('rewind');
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
  getEntriesTouchingNode(id: EntityId): LogEntry<TNode, TEdge, TEvent>[] {
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

  // Returns a plain serializable object capturing the full mutation log and cursor position.
  export(): SerializedTemporalGraph<TNode, TEdge, TEvent> {
    return { version: 1, cursorIndex: this.cursorIndex, entries: [...this.entries] };
  }

  /**
   * Restores a TemporalGraph from data produced by {@link export}. Rebuilds all derived state
   * (live nodes/edges, adjacency, history indexes) by replaying the log up to the saved cursor.
   * @throws If `data.version` is not supported.
   */
  static import<TNode, TEdge extends BaseEdgeData = BaseEdgeData, TEvent = unknown>(
    data: SerializedTemporalGraph<TNode, TEdge, TEvent>,
  ): TemporalGraph<TNode, TEdge, TEvent> {
    if (data.version !== 1) {
      throw new UnsupportedVersionError((data as { version: number }).version);
    }
    const graph = new TemporalGraph<TNode, TEdge, TEvent>();
    graph.entries = [...data.entries];
    for (let i = 0; i < graph.entries.length; i += 1) {
      const entry = graph.entries[i];
      if (entry === undefined) continue;
      indexEntry(graph.nodeHistory, graph.edgeHistory, entry, i);
      if (i < data.cursorIndex) {
        applyEntryNoDelta(graph.nodeState, graph.edgeState, graph.adjacency, entry);
      }
    }
    graph.cursorIndex = data.cursorIndex;
    return graph;
  }
}
