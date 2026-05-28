import { describe, expect, it } from 'vitest';
import { ALICE, ALICE_V2, BOB, delFollow, delUser, newGraph, setFollow, setUser } from './helpers';

describe('getNodeAt()', () => {
  it('returns the node value at the snapshot it was created', () => {
    const g = newGraph();
    g.append({ snapshot: 10, mutations: [setUser('alice', ALICE)] });
    expect(g.getNodeAt('alice', 10)).toEqual(ALICE);
  });

  it('returns the node value at a snapshot after creation with no update', () => {
    const g = newGraph();
    g.append({ snapshot: 10, mutations: [setUser('alice', ALICE)] });
    expect(g.getNodeAt('alice', 99)).toEqual(ALICE);
  });

  it('returns undefined before the node was created', () => {
    const g = newGraph();
    g.append({ snapshot: 10, mutations: [setUser('alice', ALICE)] });
    expect(g.getNodeAt('alice', 5)).toBeUndefined();
  });

  it('returns the correct version at each snapshot when a node is updated', () => {
    const g = newGraph();
    g.append({ snapshot: 10, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 20, mutations: [setUser('alice', ALICE_V2)] });
    expect(g.getNodeAt('alice', 15)).toEqual(ALICE);
    expect(g.getNodeAt('alice', 20)).toEqual(ALICE_V2);
    expect(g.getNodeAt('alice', 25)).toEqual(ALICE_V2);
  });

  it('returns undefined after the node was deleted', () => {
    const g = newGraph();
    g.append({ snapshot: 10, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 20, mutations: [delUser('alice')] });
    expect(g.getNodeAt('alice', 25)).toBeUndefined();
  });

  it('returns the value in the window between creation and deletion', () => {
    const g = newGraph();
    g.append({ snapshot: 10, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 20, mutations: [delUser('alice')] });
    expect(g.getNodeAt('alice', 15)).toEqual(ALICE);
  });

  it('returns undefined for a completely unknown node id', () => {
    expect(newGraph().getNodeAt('nobody', 10)).toBeUndefined();
  });

  it('works correctly regardless of current cursor position', () => {
    const g = newGraph();
    g.append({ snapshot: 10, mutations: [setUser('alice', ALICE)] });
    g.append({ snapshot: 20, mutations: [setUser('alice', ALICE_V2)] });
    g.rewind(10); // cursor is at snapshot 10
    expect(g.getNodeAt('alice', 20)).toEqual(ALICE_V2);
  });
});

describe('getEdgeAt()', () => {
  function build() {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 5, mutations: [setFollow('e1', 'alice', 'bob', 500)] });
    g.append({ snapshot: 10, mutations: [delFollow('e1')] });
    return g;
  }

  it('returns the edge value at the snapshot it was created', () => {
    expect(build().getEdgeAt('e1', 5)).toMatchObject({
      source: 'alice',
      target: 'bob',
      since: 500,
    });
  });

  it('returns the edge value at a snapshot after creation', () => {
    expect(build().getEdgeAt('e1', 7)).toMatchObject({ source: 'alice', target: 'bob' });
  });

  it('returns undefined before the edge was created', () => {
    expect(build().getEdgeAt('e1', 3)).toBeUndefined();
  });

  it('returns undefined at the snapshot the edge was deleted', () => {
    expect(build().getEdgeAt('e1', 10)).toBeUndefined();
  });

  it('returns undefined after the edge was deleted', () => {
    expect(build().getEdgeAt('e1', 99)).toBeUndefined();
  });

  it('returns undefined for an unknown edge id', () => {
    expect(build().getEdgeAt('e999', 5)).toBeUndefined();
  });
});

describe('getEdgesForNodeAt()', () => {
  it('returns edge IDs connected to a node at the given snapshot', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    expect(g.getEdgesForNodeAt('alice', 2)).toContain('e1');
  });

  it('returns the edge for both source and target nodes', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    expect(g.getEdgesForNodeAt('alice', 2)).toContain('e1');
    expect(g.getEdgesForNodeAt('bob', 2)).toContain('e1');
  });

  it('excludes edges not yet created at the snapshot', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 5, mutations: [setFollow('e1', 'alice', 'bob')] });
    expect(g.getEdgesForNodeAt('alice', 3).has('e1')).toBe(false);
  });

  it('excludes edges deleted before the snapshot', () => {
    const g = newGraph();
    g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
    g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
    g.append({ snapshot: 3, mutations: [delFollow('e1')] });
    expect(g.getEdgesForNodeAt('alice', 5).has('e1')).toBe(false);
  });
});
