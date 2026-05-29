import { describe, expect, it } from 'vitest';
import { ALICE, ALICE_V2, BOB, CAROL, newGraph, setUser } from './helpers';

describe('entry() — setNode / setEdge', () => {
  it('setNode adds a node to the graph', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).append();
    expect(g.hasNode('alice')).toBe(true);
    expect(g.getNode('alice')).toEqual(ALICE);
  });

  it('setEdge adds an edge to the graph', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).setNode('bob', BOB).append();
    g.entry(2).setEdge('e1', { source: 'alice', target: 'bob', since: 0 }).append();
    expect(g.hasEdge('e1')).toBe(true);
    expect(g.getEdge('e1')).toMatchObject({ source: 'alice', target: 'bob' });
  });

  it('chains multiple mutations in a single entry', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).setNode('bob', BOB).setNode('carol', CAROL).append();
    expect(g.nodeCount).toBe(3);
  });

  it('updates an existing node', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).append();
    g.entry(2).setNode('alice', ALICE_V2).append();
    expect(g.getNode('alice')).toEqual(ALICE_V2);
    expect(g.nodeCount).toBe(1);
  });
});

describe('entry() — deleteNode / deleteEdge', () => {
  it('deleteNode removes a node from the graph', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).append();
    g.entry(2).deleteNode('alice').append();
    expect(g.hasNode('alice')).toBe(false);
    expect(g.nodeCount).toBe(0);
  });

  it('deleteEdge removes an edge from the graph', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).setNode('bob', BOB).append();
    g.entry(2).setEdge('e1', { source: 'alice', target: 'bob', since: 0 }).append();
    g.entry(3).deleteEdge('e1').append();
    expect(g.hasEdge('e1')).toBe(false);
    expect(g.edgeCount).toBe(0);
  });

  it('mixing add and delete in one entry works', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).setNode('bob', BOB).append();
    g.entry(2).setNode('carol', CAROL).deleteNode('bob').append();
    expect(g.hasNode('carol')).toBe(true);
    expect(g.hasNode('bob')).toBe(false);
    expect(g.nodeCount).toBe(2);
  });
});

describe('entry() — event()', () => {
  it('attaches an event payload to the entry', () => {
    const g = newGraph();
    g.entry(1).event({ type: 'join' }).setNode('alice', ALICE).append();
    expect(g.getEventsAt(1)).toEqual([{ type: 'join' }]);
  });

  it('entries without event() produce no events at that snapshot', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).append();
    expect(g.getEventsAt(1)).toEqual([]);
  });
});

describe('entry() — append() return value', () => {
  it('returns a delta with nodes.added for a new node', () => {
    const g = newGraph();
    const delta = g.entry(1).setNode('alice', ALICE).append();
    expect(delta.nodes.added).toContain('alice');
    expect(delta.nodes.updated.size).toBe(0);
    expect(delta.nodes.removed.size).toBe(0);
  });

  it('returns a delta with nodes.updated when overwriting', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).append();
    const delta = g.entry(2).setNode('alice', ALICE_V2).append();
    expect(delta.nodes.updated).toContain('alice');
    expect(delta.nodes.added.size).toBe(0);
  });

  it('returns a delta with nodes.removed when deleting', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).append();
    const delta = g.entry(2).deleteNode('alice').append();
    expect(delta.nodes.removed).toContain('alice');
  });

  it('returns the same delta as the equivalent graph.append() call', () => {
    const g1 = newGraph();
    const d1 = g1.entry(1).setNode('alice', ALICE).setNode('bob', BOB).append();

    const g2 = newGraph();
    const d2 = g2.append({
      snapshot: 1,
      mutations: [setUser('alice', ALICE), setUser('bob', BOB)],
    });

    expect([...d1.nodes.added]).toEqual(expect.arrayContaining([...d2.nodes.added]));
    expect(d1.nodes.added.size).toBe(d2.nodes.added.size);
  });
});

describe('entry() — build()', () => {
  it('build() returns an EntryInput with the correct snapshot', () => {
    const g = newGraph();
    const input = g.entry(42).setNode('alice', ALICE).build();
    expect(input.snapshot).toBe(42);
  });

  it('build() without event() has no event property', () => {
    const g = newGraph();
    const input = g.entry(1).setNode('alice', ALICE).build();
    expect('event' in input).toBe(false);
  });

  it('build() with event() includes the event payload', () => {
    const g = newGraph();
    const input = g.entry(1).event({ type: 'join' }).setNode('alice', ALICE).build();
    expect('event' in input && (input as { event: unknown }).event).toEqual({ type: 'join' });
  });

  it('build() mutations array is a defensive copy', () => {
    const g = newGraph();
    const builder = g.entry(1).setNode('alice', ALICE);
    const a = builder.build();
    const b = builder.build();
    expect(a.mutations).not.toBe(b.mutations);
    expect(a.mutations).toEqual(b.mutations);
  });

  it('build() result can be passed to graph.ingest()', () => {
    const g = newGraph();
    const a = g.entry(10).setNode('alice', ALICE).build();
    const b = g.entry(20).setNode('bob', BOB).build();
    g.ingest([a, b]);
    expect(g.nodeCount).toBe(2);
    expect(g.currentSnapshot).toBe(20);
  });
});

describe('entry() — error propagation', () => {
  it('throws when deleting a node that does not exist', () => {
    const g = newGraph();
    expect(() => g.entry(1).deleteNode('alice').append()).toThrow();
  });

  it('throws when cursor is not at head', () => {
    const g = newGraph();
    g.entry(1).setNode('alice', ALICE).append();
    g.entry(2).setNode('bob', BOB).append();
    g.rewind(1);
    expect(() => g.entry(3).setNode('carol', CAROL).append()).toThrow();
  });

  it('throws when the snapshot goes backwards', () => {
    const g = newGraph();
    g.entry(10).setNode('alice', ALICE).append();
    expect(() => g.entry(5).setNode('bob', BOB).append()).toThrow();
  });
});
