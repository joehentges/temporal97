import { describe, expect, it } from 'vitest';
import {
  ALICE,
  ALICE_V2,
  BOB,
  CAROL,
  delFollow,
  delUser,
  newGraph,
  setFollow,
  setUser,
} from './helpers';

describe('initial state', () => {
  it('has zero nodes and edges', () => {
    const g = newGraph();
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
  });

  it('has zero log entries', () => {
    expect(newGraph().entryCount).toBe(0);
  });

  it('currentSnapshot is -Infinity', () => {
    expect(newGraph().currentSnapshot).toBe(-Infinity);
  });

  it('hasNode returns false for any id', () => {
    expect(newGraph().hasNode('alice')).toBe(false);
  });

  it('getNode returns undefined for any id', () => {
    expect(newGraph().getNode('alice')).toBeUndefined();
  });

  it('hasEdge returns false for any id', () => {
    expect(newGraph().hasEdge('e1')).toBe(false);
  });

  it('liveNodes yields nothing', () => {
    expect([...newGraph().liveNodes()]).toHaveLength(0);
  });

  it('liveEdges yields nothing', () => {
    expect([...newGraph().liveEdges()]).toHaveLength(0);
  });

  it('getSnapshotIds returns empty array', () => {
    expect(newGraph().getSnapshotIds()).toEqual([]);
  });
});

describe('append() — nodes', () => {
  it('adds a node that is immediately queryable', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    expect(g.hasNode('alice')).toBe(true);
    expect(g.getNode('alice')).toEqual(ALICE);
  });

  it('nodeCount increments for each new node', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    expect(g.nodeCount).toBe(1);
    g.append({ snapshot: 2, mutations: [setUser('bob', BOB)] });
    expect(g.nodeCount).toBe(2);
  });

  it('updates an existing node value in place', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [setUser('alice', ALICE_V2)] });
    expect(g.getNode('alice')).toEqual(ALICE_V2);
    expect(g.nodeCount).toBe(1);
  });

  it('deletes a node — it vanishes from live state', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [delUser('alice')] });
    expect(g.hasNode('alice')).toBe(false);
    expect(g.getNode('alice')).toBeUndefined();
    expect(g.nodeCount).toBe(0);
  });

  it('allows re-adding a node after deletion', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [delUser('alice')] });
    g.append({ snapshot: 3, mutations: [setUser('alice', ALICE_V2)] });
    expect(g.getNode('alice')).toEqual(ALICE_V2);
  });

  it('supports multiple node mutations in a single entry', () => {
    const g = newGraph();
    g.append({
      snapshot: 1,
      mutations: [setUser('alice', ALICE), setUser('bob', BOB), setUser('carol', CAROL)],
    });
    expect(g.nodeCount).toBe(3);
    expect(g.getNode('carol')).toEqual(CAROL);
  });

  it('entryCount tracks number of appended entries, not mutations', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 1, mutations: [setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setUser('carol', CAROL)] });
    expect(g.entryCount).toBe(3);
  });
});

describe('append() — edges', () => {
  it('adds an edge with correct source and target', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob', 1000)] });
    expect(g.hasEdge('e1')).toBe(true);
    expect(g.getEdge('e1')).toMatchObject({ source: 'alice', target: 'bob', since: 1000 });
  });

  it('edgeCount increments for each new edge', () => {
    const g = newGraph();
    g.append({
      snapshot: 1,
      mutations: [setUser('alice', ALICE), setUser('bob', BOB), setUser('carol', CAROL)],
    });
    g.append({
      snapshot: 2,
      mutations: [setFollow('e1', 'alice', 'bob'), setFollow('e2', 'alice', 'carol')],
    });
    expect(g.edgeCount).toBe(2);
  });

  it('deletes an edge — it vanishes from live state', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    g.append({ snapshot: 3, mutations: [delFollow('e1')] });
    expect(g.hasEdge('e1')).toBe(false);
    expect(g.edgeCount).toBe(0);
  });

  it('removes deleted edge from adjacency', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    g.append({ snapshot: 3, mutations: [delFollow('e1')] });
    expect(g.getEdgesForNode('alice').size).toBe(0);
    expect(g.degree('alice')).toBe(0);
  });
});

describe('append() — delta', () => {
  it('reports nodes.added for a brand-new node', () => {
    const g = newGraph();
    const delta = g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    expect(delta.nodes.added).toContain('alice');
    expect(delta.nodes.updated.size).toBe(0);
    expect(delta.nodes.removed.size).toBe(0);
  });

  it('reports nodes.updated when overwriting an existing node', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    const delta = g.append({ snapshot: 2, mutations: [setUser('alice', ALICE_V2)] });
    expect(delta.nodes.updated).toContain('alice');
    expect(delta.nodes.added.size).toBe(0);
  });

  it('reports nodes.removed when a node is deleted', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    const delta = g.append({ snapshot: 2, mutations: [delUser('alice')] });
    expect(delta.nodes.removed).toContain('alice');
  });

  it('reports edges.added for a new edge', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    const delta = g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    expect(delta.edges.added).toContain('e1');
    expect(delta.edges.updated.size).toBe(0);
  });

  it('reports edges.removed when an edge is deleted', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    const delta = g.append({ snapshot: 3, mutations: [delFollow('e1')] });
    expect(delta.edges.removed).toContain('e1');
  });

  it('captures mixed node and edge changes in one entry', () => {
    const g = newGraph();
    const delta = g.append({
      snapshot: 1,
      mutations: [setUser('alice', ALICE), setUser('bob', BOB), setFollow('e1', 'alice', 'bob')],
    });
    expect(delta.nodes.added).toContain('alice');
    expect(delta.nodes.added).toContain('bob');
    expect(delta.edges.added).toContain('e1');
  });
});

describe('append() — events', () => {
  it('attaches an event to the log entry', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)], event: { type: 'join' } });
    expect(g.getEventsAt(1)).toEqual([{ type: 'join' }]);
  });

  it('entries without an event produce no events at that snapshot', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    expect(g.getEventsAt(1)).toEqual([]);
  });

  it('multiple events at the same snapshot are all returned', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)], event: { type: 'join' } });
    g.append({ snapshot: 1, mutations: [setUser('bob', BOB)], event: { type: 'follow' } });
    const events = g.getEventsAt(1);
    expect(events).toContainEqual({ type: 'join' });
    expect(events).toContainEqual({ type: 'follow' });
  });
});

describe('append() — errors', () => {
  it('throws when the cursor is not at head after a rewind', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [setUser('bob', BOB)] });
    g.rewind(1);
    expect(() => g.append({ snapshot: 3, mutations: [setUser('carol', CAROL)] })).toThrow();
  });

  it('throws when the new snapshot is strictly before the current one', () => {
    const g = newGraph();
    g.append({ snapshot: 5, mutations: [setUser('alice', ALICE)] });
    expect(() => g.append({ snapshot: 3, mutations: [setUser('bob', BOB)] })).toThrow();
  });

  it('allows appending at the same snapshot as the current one', () => {
    const g = newGraph();
    g.append({ snapshot: 5, mutations: [setUser('alice', ALICE)] });
    expect(() => g.append({ snapshot: 5, mutations: [setUser('bob', BOB)] })).not.toThrow();
  });

  it('throws when deleting a node that does not exist', () => {
    expect(() => newGraph().append({ snapshot: 1, mutations: [delUser('alice')] })).toThrow();
  });

  it('throws when deleting an edge that does not exist', () => {
    expect(() => newGraph().append({ snapshot: 1, mutations: [delFollow('e1')] })).toThrow();
  });
});

describe('ingest()', () => {
  it('bulk-loads entries and makes their state queryable', () => {
    const g = newGraph();
    g.ingest([
      { snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] },
      { snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] },
    ]);
    expect(g.nodeCount).toBe(2);
    expect(g.edgeCount).toBe(1);
    expect(g.entryCount).toBe(2);
    expect(g.getNode('alice')).toEqual(ALICE);
  });

  it('produces the same live state as sequential append calls', () => {
    const ia = newGraph();
    ia.ingest([
      { snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] },
      { snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] },
    ]);

    const ap = newGraph();
    ap.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    ap.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });

    expect(ia.getNode('alice')).toEqual(ap.getNode('alice'));
    expect(ia.hasEdge('e1')).toBe(ap.hasEdge('e1'));
    expect(ia.currentSnapshot).toBe(ap.currentSnapshot);
  });

  it('returns a single net delta covering the whole batch', () => {
    const g = newGraph();
    const delta = g.ingest([
      { snapshot: 1, mutations: [setUser('alice', ALICE)] },
      { snapshot: 2, mutations: [setUser('alice', ALICE_V2)] },
      { snapshot: 3, mutations: [setUser('bob', BOB)] },
    ]);
    expect(delta.nodes.added).toContain('alice');
    expect(delta.nodes.added).toContain('bob');
    expect(delta.nodes.removed.size).toBe(0);
  });

  it('a node added then deleted in the same batch has no net presence', () => {
    const g = newGraph();
    const delta = g.ingest([
      { snapshot: 1, mutations: [setUser('alice', ALICE)] },
      { snapshot: 2, mutations: [delUser('alice')] },
    ]);
    expect(delta.nodes.added.has('alice')).toBe(false);
    expect(delta.nodes.removed.has('alice')).toBe(false);
    expect(delta.nodes.updated.has('alice')).toBe(false);
  });

  it('currentSnapshot equals the last ingested snapshot', () => {
    const g = newGraph();
    g.ingest([
      { snapshot: 10, mutations: [setUser('alice', ALICE)] },
      { snapshot: 20, mutations: [setUser('bob', BOB)] },
    ]);
    expect(g.currentSnapshot).toBe(20);
  });

  it('allows multiple entries at the same snapshot', () => {
    const g = newGraph();
    expect(() =>
      g.ingest([
        { snapshot: 1, mutations: [setUser('alice', ALICE)] },
        { snapshot: 1, mutations: [setUser('bob', BOB)] },
      ]),
    ).not.toThrow();
    expect(g.nodeCount).toBe(2);
  });

  it('throws when cursor is not at head', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [setUser('bob', BOB)] });
    g.rewind(1);
    expect(() => g.ingest([{ snapshot: 3, mutations: [setUser('carol', CAROL)] }])).toThrow();
  });

  it('throws when entries are not sorted by ascending snapshot', () => {
    expect(() =>
      newGraph().ingest([
        { snapshot: 5, mutations: [setUser('alice', ALICE)] },
        { snapshot: 3, mutations: [setUser('bob', BOB)] },
      ]),
    ).toThrow();
  });
});
