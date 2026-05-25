import { describe, expect, it } from 'vitest';
import { ALICE, ALICE_V2, BOB, CAROL, delUser, newGraph, setFollow, setUser } from './helpers';

function buildGraph() {
  const g = newGraph();
  g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
  g.append({ snapshot: 2, mutations: [setUser('bob', BOB)] });
  g.append({ snapshot: 3, mutations: [setFollow('e1', 'alice', 'bob')] });
  return g;
}

// ---------------------------------------------------------------------------
// advance()
// ---------------------------------------------------------------------------
describe('advance()', () => {
  it('moves the cursor forward to the target snapshot', () => {
    const g = buildGraph();
    g.seekTo(1);
    g.advance(2);
    expect(g.currentSnapshot).toBe(2);
  });

  it('applies mutations of entries up to and including the target snapshot', () => {
    const g = buildGraph();
    g.seekTo(1);
    expect(g.hasNode('bob')).toBe(false);
    g.advance(2);
    expect(g.hasNode('bob')).toBe(true);
    expect(g.hasEdge('e1')).toBe(false);
  });

  it('returns delta for what changed during the advance', () => {
    const g = buildGraph();
    g.seekTo(1);
    const delta = g.advance(2);
    expect(delta.nodes.added).toContain('bob');
  });

  it('includes entries for the exact target snapshot', () => {
    const g = buildGraph();
    g.seekTo(2);
    const delta = g.advance(3);
    expect(delta.edges.added).toContain('e1');
    expect(g.hasEdge('e1')).toBe(true);
  });

  it('throws when target is before the current snapshot', () => {
    expect(() => buildGraph().advance(1)).toThrow();
  });

  it('is a no-op and returns empty delta when already at target', () => {
    const g = buildGraph();
    const delta = g.advance(3); // already at 3
    expect(delta.nodes.added.size).toBe(0);
    expect(delta.nodes.removed.size).toBe(0);
    expect(delta.edges.added.size).toBe(0);
  });

  it('stops at the highest snapshot not exceeding the target', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 5, mutations: [setUser('bob', BOB)] });
    g.seekTo(1);
    g.advance(10); // no entry at 10; should apply up to snapshot 5
    expect(g.hasNode('bob')).toBe(true);
    expect(g.currentSnapshot).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// rewind()
// ---------------------------------------------------------------------------
describe('rewind()', () => {
  it('moves the cursor backward to the target snapshot', () => {
    const g = buildGraph();
    g.rewind(1);
    expect(g.currentSnapshot).toBe(1);
  });

  it('undoes mutations recorded after the target snapshot', () => {
    const g = buildGraph();
    g.rewind(1);
    expect(g.hasNode('alice')).toBe(true);
    expect(g.hasNode('bob')).toBe(false);
    expect(g.hasEdge('e1')).toBe(false);
  });

  it('returns a delta describing what was undone', () => {
    const g = buildGraph();
    const delta = g.rewind(1);
    expect(delta.nodes.removed).toContain('bob');
    expect(delta.edges.removed).toContain('e1');
  });

  it('throws when target is after the current snapshot', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    expect(() => g.rewind(5)).toThrow();
  });

  it('rewinding past all entries leaves the graph empty', () => {
    const g = buildGraph();
    g.rewind(0);
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
  });

  it('round-trip rewind → advance restores state exactly', () => {
    const g = buildGraph();
    g.rewind(1);
    g.advance(3);
    expect(g.hasNode('alice')).toBe(true);
    expect(g.hasNode('bob')).toBe(true);
    expect(g.hasEdge('e1')).toBe(true);
    expect(g.nodeCount).toBe(2);
    expect(g.edgeCount).toBe(1);
  });

  it('after rewinding, append is forbidden until seekTo head', () => {
    const g = buildGraph();
    g.rewind(1);
    expect(() => g.append({ snapshot: 4, mutations: [setUser('carol', CAROL)] })).toThrow();
    g.seekTo(3);
    expect(() => g.append({ snapshot: 4, mutations: [setUser('carol', CAROL)] })).not.toThrow();
  });

  it('correctly undoes a node deletion when rewound', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [delUser('alice')] });
    expect(g.hasNode('alice')).toBe(false);
    g.rewind(1);
    expect(g.hasNode('alice')).toBe(true);
    expect(g.getNode('alice')).toEqual(ALICE);
  });

  it('correctly undoes a node update when rewound', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 2, mutations: [setUser('alice', ALICE_V2)] });
    g.rewind(1);
    expect(g.getNode('alice')).toEqual(ALICE);
  });
});

// ---------------------------------------------------------------------------
// seekTo()
// ---------------------------------------------------------------------------
describe('seekTo()', () => {
  it('seeks backward to a past snapshot', () => {
    const g = buildGraph();
    g.seekTo(1);
    expect(g.currentSnapshot).toBe(1);
    expect(g.hasNode('bob')).toBe(false);
  });

  it('seeks forward from a rewound position', () => {
    const g = buildGraph();
    g.rewind(0);
    g.seekTo(3);
    expect(g.currentSnapshot).toBe(3);
    expect(g.hasNode('alice')).toBe(true);
    expect(g.hasEdge('e1')).toBe(true);
  });

  it('is a no-op when called with the current snapshot', () => {
    const g = buildGraph();
    const delta = g.seekTo(3);
    expect(delta.nodes.added.size).toBe(0);
    expect(delta.edges.added.size).toBe(0);
  });

  it('allows append after seeking back to head', () => {
    const g = buildGraph();
    g.rewind(1);
    g.seekTo(3);
    expect(() => g.append({ snapshot: 4, mutations: [setUser('carol', CAROL)] })).not.toThrow();
  });
});
