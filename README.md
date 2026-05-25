# temporal97

> A TypeScript temporal graph with snapshot-based time travel and mutation history tracking.

[![CI](https://github.com/JoeHentges/temporal97/actions/workflows/ci.yml/badge.svg)](https://github.com/JoeHentges/temporal97/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/temporal97.svg)](https://www.npmjs.com/package/temporal97)
[![license](https://img.shields.io/npm/l/temporal97.svg)](./LICENSE)

## Overview

`temporal97` is a fully-typed graph data structure that records every change as an immutable log. You can replay history forward with `advance()`, undo it with `rewind()`, or jump to any point in time with `seekTo()`. Point-in-time queries let you read the value of any node or edge without moving the cursor.

## Installation

```bash
npm install temporal97
# or
pnpm add temporal97
# or
yarn add temporal97
```

## Quick Start

```ts
import { TemporalGraph, MutationKindEnum, MutationOperationEnum } from "temporal97";

type Node = { label: string };
type Edge = { source: string; target: string; weight: number };

const graph = new TemporalGraph<Node, Edge>();

// Snapshot 1 — add two nodes and an edge
// You can use string literals or the exported enums for kind/op
graph.append({
  snapshot: 1,
  mutations: [
    { kind: MutationKindEnum.Node, op: MutationOperationEnum.Set, id: "a", value: { label: "Alice" } },
    { kind: MutationKindEnum.Node, op: MutationOperationEnum.Set, id: "b", value: { label: "Bob" } },
    { kind: MutationKindEnum.Edge, op: MutationOperationEnum.Set, id: "a->b", value: { source: "a", target: "b", weight: 1 } },
  ],
});

// Snapshot 2 — update the edge weight
graph.append({
  snapshot: 2,
  mutations: [
    { kind: "edge", op: "set", id: "a->b", value: { source: "a", target: "b", weight: 5 } },
  ],
});

// Read current (snapshot 2) state
console.log(graph.getEdge("a->b")); // { source: "a", target: "b", weight: 5 }

// Point-in-time read — no cursor movement required
console.log(graph.getEdgeAt("a->b", 1)); // { source: "a", target: "b", weight: 1 }

// Rewind the cursor to snapshot 1
const delta = graph.rewind(1);
console.log(delta.edges.updated); // Set { "a->b" }
console.log(graph.getEdge("a->b")); // { source: "a", target: "b", weight: 1 }
```

## Core Concepts

| Concept | Description |
|---|---|
| **Snapshot** | A numeric timestamp (`SnapshotId = number`). Multiple log entries can share the same snapshot. |
| **Mutation** | A single `Set` or `Delete` operation on a node or edge. |
| **Entry** | A bundle of mutations recorded at one snapshot, with an optional typed event payload. |
| **Cursor** | The position in the log that represents the graph's current live state. |
| **Delta** | Returned by every write and cursor-move operation — describes which nodes/edges were added, updated, or removed. |

## API Reference

### Writing

#### `append(input): Delta`

Appends a single entry at the head of the log. Throws if the cursor is not at head or if the snapshot would go backwards.

```ts
const delta = graph.append({
  snapshot: 3,
  event: { type: "node-removed" }, // optional typed event payload
  mutations: [
    { kind: "node", op: "delete", id: "b" },
  ],
});
// delta.nodes.removed → Set { "b" }
```

#### `ingest(inputs): Delta`

Bulk-appends a pre-sorted array of entries. More efficient than repeated `append` calls because it computes a single diff for the whole batch. Throws if entries are not in ascending snapshot order.

```ts
graph.ingest([
  { snapshot: 10, mutations: [...] },
  { snapshot: 20, mutations: [...] },
]);
```

### Cursor Movement (Time Travel)

All three methods return a `Delta` describing what changed.

#### `seekTo(snapshot): Delta`

Moves the cursor to any snapshot — forward or backward. General-purpose alternative to calling `advance` or `rewind` directly.

#### `advance(snapshot): Delta`

Moves the cursor forward. Throws if `snapshot` is before the current position.

#### `rewind(snapshot): Delta`

Moves the cursor backward by undoing entries in reverse. Throws if `snapshot` is after the current position.

### Reading Current State

These reflect the graph at the current cursor position.

| Method / Property | Returns | Description |
|---|---|---|
| `hasNode(id)` | `boolean` | Whether the node exists. |
| `getNode(id)` | `TNode \| undefined` | Node data, or `undefined`. |
| `hasEdge(id)` | `boolean` | Whether the edge exists. |
| `getEdge(id)` | `TEdge \| undefined` | Edge data, or `undefined`. |
| `getEdgesForNode(id)` | `ReadonlySet<EntityId>` | All edge IDs connected to a node. |
| `getNeighbors(id)` | `IterableIterator<Neighbor>` | All neighbors (node ID + edge ID + edge data). |
| `inNeighbors(id)` | `IterableIterator<Neighbor>` | Neighbors with an edge pointing **into** `id`. |
| `outNeighbors(id)` | `IterableIterator<Neighbor>` | Neighbors `id` has an outgoing edge **to**. |
| `degree(id)` | `number` | Total edge count (in + out). |
| `inDegree(id)` | `number` | Number of incoming edges. |
| `outDegree(id)` | `number` | Number of outgoing edges. |
| `liveNodes()` | `IterableIterator<[EntityId, TNode]>` | All alive nodes. |
| `liveEdges()` | `IterableIterator<[EntityId, TEdge]>` | All alive edges. |
| `getLiveSnapshot()` | `{ nodes, edges, events }` | Live nodes, edges, and events at the current snapshot. |
| `currentSnapshot` | `SnapshotId` | The snapshot at the cursor (`-Infinity` when empty). |
| `nodeCount` | `number` | Number of alive nodes. |
| `edgeCount` | `number` | Number of alive edges. |
| `entryCount` | `number` | Total log entries across all snapshots. |

### Historical Queries (No Cursor Movement)

Read the value of any node or edge at an arbitrary past snapshot without moving the cursor.

| Method | Returns | Description |
|---|---|---|
| `getNodeAt(id, snapshot)` | `TNode \| undefined` | Node value at the given snapshot. |
| `getEdgeAt(id, snapshot)` | `TEdge \| undefined` | Edge value at the given snapshot. |
| `getEdgesForNodeAt(id, snapshot)` | `ReadonlySet<EntityId>` | Edge IDs connected to a node at the given snapshot. |
| `getNeighborsAt(id, snapshot)` | `ReadonlyArray<Neighbor>` | Neighbors of a node at the given snapshot. |

### Log Queries

| Method | Returns | Description |
|---|---|---|
| `getSnapshots()` | `Array<{ snapshot, entries }>` | All snapshots paired with their entries. |
| `getSnapshotIds()` | `SnapshotId[]` | Ordered list of unique snapshot IDs. |
| `getEntriesBySnapshot(snapshot)` | `LogEntry[]` | All entries recorded at exactly `snapshot`. |
| `getEntriesBetween(from, to)` | `LogEntry[]` | All entries in the inclusive range `[from, to]`. |
| `getEntriesTouching(nodeId)` | `LogEntry[]` | All entries that mutated a node. |
| `getEntriesTouchingEdge(edgeId)` | `LogEntry[]` | All entries that mutated an edge. |
| `getEventsAt(snapshot)` | `TEvent[]` | Event payloads attached to entries at `snapshot`. |
| `getNodeHistory(id)` | `Array<{ snapshot, value }>` | Full chronological value history for a node. |

### Serialization

#### `graph.export(): SerializedTemporalGraph`

Returns a plain serializable object capturing the full mutation log and cursor position.

```ts
const data = graph.export();
localStorage.setItem("graph", JSON.stringify(data));
```

#### `TemporalGraph.import(data): TemporalGraph`

Restores a graph from exported data. Rebuilds all derived state by replaying the log up to the saved cursor.

```ts
const data = JSON.parse(localStorage.getItem("graph")!);
const graph = TemporalGraph.import<Node, Edge>(data);
```

## Types

```ts
type SnapshotId = number;
type EntityId = string;

interface BaseEdgeData {
  source: EntityId;
  target: EntityId;
}

interface Neighbor<TEdge extends BaseEdgeData> {
  nodeId: EntityId;
  edgeId: EntityId;
  edge: TEdge;
}

interface Delta {
  nodes: { added: Set<EntityId>; updated: Set<EntityId>; removed: Set<EntityId> };
  edges: { added: Set<EntityId>; updated: Set<EntityId>; removed: Set<EntityId> };
}

interface LogEntry<TNode, TEdge, TEvent> {
  snapshot: SnapshotId;
  event: TEvent | undefined;
  mutations: Mutation<TNode, TEdge>[];
}
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repo
2. Create your feature branch: `git checkout -b feat/my-feature`
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push and open a pull request

## License

[MIT](./LICENSE) © JoeHentges
