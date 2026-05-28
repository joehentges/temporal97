import { bench, describe } from 'vitest';
import { type MutationInput, TemporalGraph } from '../src/index';

type Node = { id: string };
type Edge = { source: string; target: string };

function buildGraph(nodeCount: number, edgeCount: number) {
  const graph = new TemporalGraph<Node, Edge>();
  const inputs = [];

  for (let i = 0; i < nodeCount; i++) {
    const mutations: MutationInput<Node, Edge>[] = [
      { kind: 'node' as const, op: 'set' as const, id: `n${i}`, value: { id: `n${i}` } },
    ];
    if (i > 0 && i <= edgeCount) {
      mutations.push({
        kind: 'edge' as const,
        op: 'set' as const,
        id: `e${i}`,
        value: { source: `n${i - 1}`, target: `n${i}` },
      });
    }
    inputs.push({ snapshot: i, mutations });
  }

  graph.ingest(inputs);
  return graph;
}

function buildHotNode(updateCount: number) {
  const graph = new TemporalGraph<Node, Edge>();
  graph.ingest(
    Array.from({ length: updateCount }, (_, i) => ({
      snapshot: i,
      mutations: [{ kind: 'node' as const, op: 'set' as const, id: 'hot', value: { id: `v${i}` } }],
    })),
  );
  return graph;
}

function buildWarmNode(snapshotCount: number, updateEvery: number) {
  const graph = new TemporalGraph<Node, Edge>();
  graph.ingest(
    Array.from({ length: snapshotCount }, (_, i) => ({
      snapshot: i,
      mutations: [
        i % updateEvery === 0
          ? { kind: 'node' as const, op: 'set' as const, id: 'warm', value: { id: `v${i}` } }
          : {
              kind: 'node' as const,
              op: 'set' as const,
              id: `other${i}`,
              value: { id: `other${i}` },
            },
      ],
    })),
  );
  return graph;
}

function buildHub(spokeCount: number) {
  const graph = new TemporalGraph<Node, Edge>();
  const mutations: MutationInput<Node, Edge>[] = [
    { kind: 'node', op: 'set', id: 'hub', value: { id: 'hub' } },
  ];
  for (let i = 0; i < spokeCount; i++) {
    mutations.push({
      kind: 'node' as const,
      op: 'set' as const,
      id: `s${i}`,
      value: { id: `s${i}` },
    });
    mutations.push({
      kind: 'edge' as const,
      op: 'set' as const,
      id: `e${i}`,
      value: { source: 'hub', target: `s${i}` },
    });
  }
  graph.ingest([{ snapshot: 0, mutations }]);
  return graph;
}

function buildEdgeHistory(edgeCount: number, updatesPerEdge: number) {
  const graph = new TemporalGraph<Node, Edge>();
  const inputs: Array<{ snapshot: number; mutations: MutationInput<Node, Edge>[] }> = [];

  const nodesMutations: MutationInput<Node, Edge>[] = [];
  for (let i = 0; i <= edgeCount; i++) {
    nodesMutations.push({
      kind: 'node' as const,
      op: 'set' as const,
      id: `n${i}`,
      value: { id: `n${i}` },
    });
  }
  inputs.push({ snapshot: 0, mutations: nodesMutations });

  for (let u = 0; u < updatesPerEdge; u++) {
    const edgeMutations: MutationInput<Node, Edge>[] = [];
    for (let i = 0; i < edgeCount; i++) {
      edgeMutations.push({
        kind: 'edge' as const,
        op: 'set' as const,
        id: `e${i}`,
        value: { source: `n${i}`, target: `n${i + 1}` },
      });
    }
    inputs.push({ snapshot: u + 1, mutations: edgeMutations });
  }

  graph.ingest(inputs);
  return graph;
}

describe('ingest', () => {
  const makeInputs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      snapshot: i,
      mutations: [
        { kind: 'node' as const, op: 'set' as const, id: `n${i}`, value: { id: `n${i}` } },
      ],
    }));

  const inputs1k = makeInputs(1_000);
  const inputs10k = makeInputs(10_000);
  const inputs100k = makeInputs(100_000);

  bench('1 K entries', () => {
    new TemporalGraph<Node, Edge>().ingest(inputs1k);
  });

  bench('10 K entries', () => {
    new TemporalGraph<Node, Edge>().ingest(inputs10k);
  });

  bench('100 K entries', () => {
    new TemporalGraph<Node, Edge>().ingest(inputs100k);
  });
});

describe('append (single write, graph grows across iterations)', () => {
  const g = new TemporalGraph<Node, Edge>();
  let snapshot = 0;

  bench('one mutation', () => {
    g.append({
      snapshot: snapshot++,
      mutations: [{ kind: 'node' as const, op: 'set' as const, id: 'x', value: { id: 'x' } }],
    });
  });
});

describe('getNode (current state)', () => {
  const small = buildGraph(1_000, 500);
  const large = buildGraph(10_000, 5_000);

  bench('1 K nodes', () => {
    small.getNode('n500');
  });
  bench('10 K nodes', () => {
    large.getNode('n5000');
  });
});

describe('getNeighbors — varying degree', () => {
  const sparse = buildGraph(1_000, 500);
  const hub100 = buildHub(100);
  const hub1k = buildHub(1_000);

  bench('chain node, degree = 2', () => {
    for (const _ of sparse.getNeighbors('n250')) {
      // do nothing
    }
  });
  bench('hub, degree = 100', () => {
    for (const _ of hub100.getNeighbors('hub')) {
      // do nothing
    }
  });
  bench('hub, degree = 1 K', () => {
    for (const _ of hub1k.getNeighbors('hub')) {
      // do nothing
    }
  });
});

describe('getNodeAt — H_n = 1 (node set once)', () => {
  const g = buildGraph(10_000, 0);

  bench('10 K nodes, H_n = 1', () => {
    g.getNodeAt('n5000', 5_000);
  });
});

describe('getNodeAt — varying H_n', () => {
  const warm = buildWarmNode(10_000, 100);
  const hot1k = buildHotNode(1_000);
  const hot10k = buildHotNode(10_000);

  bench('warm node (H_n ≈ 100, 1% update rate)', () => {
    warm.getNodeAt('warm', 5_000);
  });
  bench('hot node  (H_n = 1 K)', () => {
    hot1k.getNodeAt('hot', 500);
  });
  bench('hot node  (H_n = 10 K)', () => {
    hot10k.getNodeAt('hot', 5_000);
  });
});

describe('getEdgesForNodeAt — varying H_e (500 edges, each mutated N times)', () => {
  const he1 = buildEdgeHistory(500, 1);
  const he5 = buildEdgeHistory(500, 5);
  const he10 = buildEdgeHistory(500, 10);

  bench('500 edges, H_e = 1', () => {
    he1.getEdgesForNodeAt('n0', 1);
  });
  bench('500 edges, H_e = 5', () => {
    he5.getEdgesForNodeAt('n0', 5);
  });
  bench('500 edges, H_e = 10', () => {
    he10.getEdgesForNodeAt('n0', 10);
  });
});

describe('seekTo (real-world traversal)', () => {
  const g = buildGraph(10_000, 0);
  const mid = 5_000;

  bench('advance and rewind (5K ping-pong)', () => {
    g.seekTo(mid);
    g.seekTo(0);
  });

  bench('full round-trip (10K ping-pong)', () => {
    g.seekTo(9_999);
    g.seekTo(0);
  });
});

describe('getEntriesTouchingNode — varying H_n', () => {
  const hot1k = buildHotNode(1_000);
  const hot10k = buildHotNode(10_000);

  bench('H_n = 1 K', () => {
    hot1k.getEntriesTouchingNode('hot');
  });
  bench('H_n = 10 K', () => {
    hot10k.getEntriesTouchingNode('hot');
  });
});

describe('getEntriesBetween', () => {
  const g = buildGraph(10_000, 0);
  bench('range of 1 K', () => {
    g.getEntriesBetween(2_000, 3_000);
  });
  bench('range of 5 K', () => {
    g.getEntriesBetween(0, 5_000);
  });
});
