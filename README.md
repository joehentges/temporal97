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
import { TemporalGraph } from "temporal97";

const graph = new TemporalGraph();

graph.append({
  snapshot: 0,
  mutations: [
    { kind: "node", op: "set", id: "a", value: { label: "Alice" } },
    { kind: "node", op: "set", id: "b", value: { label: "Bob" } },
    {
      kind: "edge",
      op: "set",
      id: "a->b",
      value: { source: "a", target: "b", weight: 1 },
    },
  ],
});

graph.append({
  snapshot: 1,
  mutations: [
    {
      kind: "edge",
      op: "set",
      id: "a->b",
      value: { source: "a", target: "b", weight: 5 },
    },
  ],
});

console.log(graph.getEdge("a->b")); // { source: "a", target: "b", weight: 5 }
console.log(graph.getEdgeAt("a->b", 1)); // { source: "a", target: "b", weight: 1 }

graph.rewind(1);
console.log(graph.getEdge("a->b")); // { source: "a", target: "b", weight: 1 }
```

## Documentation

Full documentation — API reference, core concepts, and integration guides — is available at **[joehentges.github.io/temporal97](https://joehentges.github.io/temporal97)**.

## Concurrency

`temporal97` is single-writer by design. Concurrent writes from multiple sources will produce incorrect history. For multi-writer scenarios, serialize mutations through a single event log (Kafka, EventStore, a database queue) and project the ordered stream into the graph. If you need distributed collaboration, use a CRDT (Yjs, Automerge) as the source of truth and feed its resolved operations into `temporal97` as a read model.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repo
2. Create your feature branch: `git checkout -b feat/my-feature`
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push and open a pull request

## License

[MIT](./LICENSE) © JoeHentges
