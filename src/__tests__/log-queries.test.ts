import { describe, expect, it } from 'vitest';
import { ALICE, ALICE_V2, BOB, delFollow, newGraph, setFollow, setUser } from './helpers';

// snapshot 1: two entries (one with event), snapshot 2: edge with event, snapshot 3: node update
function buildGraph() {
  const g = newGraph();
  g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)], event: { type: 'join' } });
  g.append({ snapshot: 1, mutations: [setUser('bob', BOB)] });
  g.append({
    snapshot: 2,
    mutations: [setFollow('e1', 'alice', 'bob')],
    event: { type: 'follow' },
  });
  g.append({ snapshot: 3, mutations: [setUser('alice', ALICE_V2)] });
  return g;
}

describe('getEntriesBySnapshot()', () => {
  it('returns all entries recorded at exactly that snapshot', () => {
    const g = buildGraph();
    expect(g.getEntriesBySnapshot(1)).toHaveLength(2);
    expect(g.getEntriesBySnapshot(2)).toHaveLength(1);
    expect(g.getEntriesBySnapshot(3)).toHaveLength(1);
  });

  it('returns empty array for a snapshot with no entries', () => {
    expect(buildGraph().getEntriesBySnapshot(99)).toHaveLength(0);
  });

  it('only returns entries whose snapshot exactly matches', () => {
    const entries = buildGraph().getEntriesBySnapshot(1);
    expect(entries.every((e) => e.snapshot === 1)).toBe(true);
  });
});

describe('getEntriesBetween()', () => {
  it('returns entries in the inclusive range [from, to]', () => {
    const g = buildGraph();
    expect(g.getEntriesBetween(1, 2)).toHaveLength(3); // 2 at snapshot 1, 1 at snapshot 2
  });

  it('includes both boundary snapshots', () => {
    expect(buildGraph().getEntriesBetween(2, 3)).toHaveLength(2);
  });

  it('returns all entries when the range covers everything', () => {
    expect(buildGraph().getEntriesBetween(1, 3)).toHaveLength(4);
  });

  it('returns empty array when from > to', () => {
    expect(buildGraph().getEntriesBetween(5, 1)).toHaveLength(0);
  });

  it('returns a single entry for an exact single-snapshot range', () => {
    expect(buildGraph().getEntriesBetween(2, 2)).toHaveLength(1);
  });
});

describe('getEntriesTouching()', () => {
  it('returns entries that directly mutated the node', () => {
    const g = buildGraph();
    const snaps = g.getEntriesTouching('alice').map((e) => e.snapshot);
    expect(snaps).toContain(1);
    expect(snaps).toContain(3);
  });

  it('includes entries where the node appears as an edge source or target', () => {
    const g = buildGraph();
    const snaps = g.getEntriesTouching('bob').map((e) => e.snapshot);
    expect(snaps).toContain(1); // direct node set
    expect(snaps).toContain(2); // referenced as edge target
  });

  it('returns empty array for a node that was never touched', () => {
    expect(buildGraph().getEntriesTouching('nobody')).toHaveLength(0);
  });
});

describe('getEntriesTouchingEdge()', () => {
  it('returns entries that mutated the edge', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    g.append({ snapshot: 3, mutations: [delFollow('e1')] });
    expect(g.getEntriesTouchingEdge('e1')).toHaveLength(2); // set + delete
  });

  it('returns empty array for an unknown edge', () => {
    expect(buildGraph().getEntriesTouchingEdge('e999')).toHaveLength(0);
  });
});

describe('getEventsAt()', () => {
  it('returns events attached to entries at that snapshot', () => {
    const g = buildGraph();
    expect(g.getEventsAt(1)).toContainEqual({ type: 'join' });
    expect(g.getEventsAt(2)).toContainEqual({ type: 'follow' });
  });

  it('excludes entries without events', () => {
    expect(buildGraph().getEventsAt(1)).toHaveLength(1); // only one of the two snapshot-1 entries has an event
  });

  it('returns empty array for a snapshot with no events', () => {
    expect(buildGraph().getEventsAt(3)).toHaveLength(0);
  });

  it('returns empty array for a snapshot that has no entries', () => {
    expect(buildGraph().getEventsAt(99)).toHaveLength(0);
  });
});

describe('snapshot queries', () => {
  it('getSnapshotIds returns unique IDs in ascending order', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 1, mutations: [setUser('bob', BOB)] });
    g.append({ snapshot: 3, mutations: [setFollow('e1', 'alice', 'bob')] });
    expect(g.getSnapshotIds()).toEqual([1, 3]);
  });

  it('getSnapshots groups entries by snapshot with correct counts', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 1, mutations: [setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    const snaps = g.getSnapshots();
    expect(snaps).toHaveLength(2);
    expect(snaps[0]?.snapshot).toBe(1);
    expect(snaps[0]?.entries).toHaveLength(2);
    expect(snaps[1]?.snapshot).toBe(2);
    expect(snaps[1]?.entries).toHaveLength(1);
  });

  it('currentSnapshot is -Infinity on an empty graph', () => {
    expect(newGraph().currentSnapshot).toBe(-Infinity);
  });

  it('currentSnapshot reflects the snapshot of the latest applied entry', () => {
    const g = newGraph();
    g.append({ snapshot: 5, mutations: [setUser('alice', ALICE)] });
    expect(g.currentSnapshot).toBe(5);
    g.append({ snapshot: 10, mutations: [setUser('bob', BOB)] });
    expect(g.currentSnapshot).toBe(10);
  });

  it('currentSnapshot tracks the cursor position during time travel', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [setUser('bob', BOB)] });
    g.append({ snapshot: 3, mutations: [setFollow('e1', 'alice', 'bob')] });
    g.seekTo(2);
    expect(g.currentSnapshot).toBe(2);
    g.rewind(1);
    expect(g.currentSnapshot).toBe(1);
  });
});

describe('getNodeHistory()', () => {
  it('returns chronologically ordered set-value records', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 3, mutations: [setUser('alice', ALICE_V2)] });
    const history = g.getNodeHistory('alice');
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ snapshot: 1, value: ALICE });
    expect(history[1]).toEqual({ snapshot: 3, value: ALICE_V2 });
  });

  it('returns empty array for a node that was never set', () => {
    expect(newGraph().getNodeHistory('nobody')).toHaveLength(0);
  });

  it('records consecutive sets at the same snapshot', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE_V2)] });
    expect(g.getNodeHistory('alice')).toHaveLength(2);
  });

  it('does not include entries where the node appears only as an edge endpoint', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    const history = g.getNodeHistory('alice');
    expect(history).toHaveLength(1);
    expect(history[0]?.snapshot).toBe(1);
  });
});
