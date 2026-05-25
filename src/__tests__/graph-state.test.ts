import { describe, expect, it } from 'vitest';
import { MutationKindEnum, MutationOperationEnum } from '../temporal.types';
import { ALICE, BOB, CAROL, delFollow, newGraph, setFollow, setUser } from './helpers';

describe('adjacency and degree', () => {
  // alice → bob, alice → carol, bob → carol
  function build() {
    const g = newGraph();
    g.append({
      snapshot: 1,
      mutations: [setUser('alice', ALICE), setUser('bob', BOB), setUser('carol', CAROL)],
    });
    g.append({
      snapshot: 2,
      mutations: [
        setFollow('e_ab', 'alice', 'bob'),
        setFollow('e_ac', 'alice', 'carol'),
        setFollow('e_bc', 'bob', 'carol'),
      ],
    });
    return g;
  }

  it('degree returns total number of connected edges', () => {
    const g = build();
    expect(g.degree('alice')).toBe(2); // e_ab + e_ac
    expect(g.degree('bob')).toBe(2); // e_ab + e_bc
    expect(g.degree('carol')).toBe(2); // e_ac + e_bc
  });

  it('outDegree counts edges where node is the source', () => {
    const g = build();
    expect(g.outDegree('alice')).toBe(2);
    expect(g.outDegree('bob')).toBe(1);
    expect(g.outDegree('carol')).toBe(0);
  });

  it('inDegree counts edges where node is the target', () => {
    const g = build();
    expect(g.inDegree('alice')).toBe(0);
    expect(g.inDegree('bob')).toBe(1); // alice → bob
    expect(g.inDegree('carol')).toBe(2); // alice → carol, bob → carol
  });

  it('inDegree + outDegree equals degree for all nodes', () => {
    const g = build();
    for (const id of ['alice', 'bob', 'carol']) {
      expect(g.inDegree(id) + g.outDegree(id)).toBe(g.degree(id));
    }
  });

  it('outNeighbors yields nodes this node points to', () => {
    const g = build();
    const out = [...g.outNeighbors('alice')].map((n) => n.nodeId).sort();
    expect(out).toEqual(['bob', 'carol']);
  });

  it('inNeighbors yields nodes pointing to this node', () => {
    const g = build();
    const inN = [...g.inNeighbors('carol')].map((n) => n.nodeId).sort();
    expect(inN).toEqual(['alice', 'bob']);
  });

  it('getNeighbors yields all neighbors regardless of direction', () => {
    const g = build();
    const all = [...g.getNeighbors('bob')].map((n) => n.nodeId).sort();
    expect(all).toEqual(['alice', 'carol']); // alice→bob (in), bob→carol (out)
  });

  it('getEdgesForNode returns the full set of connected edge IDs', () => {
    const g = build();
    const edges = g.getEdgesForNode('alice');
    expect(edges).toContain('e_ab');
    expect(edges).toContain('e_ac');
    expect(edges.size).toBe(2);
  });

  it('all degree counts are 0 for an isolated node', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)] });
    expect(g.degree('alice')).toBe(0);
    expect(g.inDegree('alice')).toBe(0);
    expect(g.outDegree('alice')).toBe(0);
  });

  it('getEdgesForNode returns empty set after all edges are deleted', () => {
    const g = build();
    g.append({
      snapshot: 3,
      mutations: [delFollow('e_ab'), delFollow('e_ac'), delFollow('e_bc')],
    });
    expect(g.getEdgesForNode('alice').size).toBe(0);
    expect(g.degree('alice')).toBe(0);
  });
});

describe('live state iterators', () => {
  it('liveNodes yields all current [id, data] pairs', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    const nodes = new Map(g.liveNodes());
    expect(nodes.get('alice')).toEqual(ALICE);
    expect(nodes.get('bob')).toEqual(BOB);
    expect(nodes.size).toBe(2);
  });

  it('liveNodes excludes deleted nodes', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({
      snapshot: 2,
      mutations: [{ kind: MutationKindEnum.Node, op: MutationOperationEnum.Delete, id: 'bob' }],
    });
    const ids = [...g.liveNodes()].map(([id]) => id);
    expect(ids).toContain('alice');
    expect(ids).not.toContain('bob');
  });

  it('liveEdges yields all current edges', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    const edges = new Map(g.liveEdges());
    expect(edges.has('e1')).toBe(true);
  });

  it('getLiveSnapshot bundles nodes, edges, and events at current snapshot', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE)], event: { type: 'join' } });
    const snap = g.getLiveSnapshot();
    const nodes = new Map(snap.nodes);
    expect(nodes.has('alice')).toBe(true);
    expect(snap.events).toContainEqual({ type: 'join' });
  });
});
