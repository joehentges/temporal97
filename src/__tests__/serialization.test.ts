import { describe, expect, it } from 'vitest';
import { TemporalGraph } from '../temporal-graph';
import {
  ALICE,
  ALICE_V2,
  type AppEvent,
  BOB,
  CAROL,
  type Follow,
  newGraph,
  setFollow,
  setUser,
  type User,
} from './helpers';

function build() {
  const g = newGraph();
  g.append({ snapshot: 1, mutations: [setUser('alice', ALICE), setUser('bob', BOB)] });
  g.append({ snapshot: 2, mutations: [setFollow('e1', 'alice', 'bob')] });
  g.append({ snapshot: 3, mutations: [setUser('alice', ALICE_V2)] });
  return g;
}

describe('export()', () => {
  it('produces version 1 format', () => {
    expect(build().export().version).toBe(1);
  });

  it('includes all log entries', () => {
    expect(build().export().entries).toHaveLength(3);
  });

  it('cursorIndex equals entries.length when at head', () => {
    const data = build().export();
    expect(data.cursorIndex).toBe(data.entries.length);
  });

  it('cursorIndex matches rewound position', () => {
    const g = build();
    g.seekTo(1);
    expect(g.export().cursorIndex).toBe(1);
  });
});

describe('import()', () => {
  it('restores live node and edge state', () => {
    const restored = TemporalGraph.import<User, Follow, AppEvent>(build().export());
    expect(restored.getNode('alice')).toEqual(ALICE_V2);
    expect(restored.getNode('bob')).toEqual(BOB);
    expect(restored.hasEdge('e1')).toBe(true);
  });

  it('preserves currentSnapshot', () => {
    const g = build();
    expect(TemporalGraph.import(g.export()).currentSnapshot).toBe(g.currentSnapshot);
  });

  it('restores adjacency so degree queries work', () => {
    const restored = TemporalGraph.import<User, Follow, AppEvent>(build().export());
    expect(restored.degree('alice')).toBe(1);
    expect(restored.outDegree('alice')).toBe(1);
  });

  it('restores mid-cursor state — entries after the cursor are absent from live state', () => {
    const g = build();
    g.seekTo(1);
    const restored = TemporalGraph.import<User, Follow, AppEvent>(g.export());
    expect(restored.currentSnapshot).toBe(1);
    expect(restored.hasNode('alice')).toBe(true);
    expect(restored.hasEdge('e1')).toBe(false);
  });

  it('can advance after import to replay remaining entries', () => {
    const g = build();
    g.seekTo(1);
    const restored = TemporalGraph.import<User, Follow, AppEvent>(g.export());
    restored.advance(3);
    expect(restored.hasEdge('e1')).toBe(true);
    expect(restored.getNode('alice')).toEqual(ALICE_V2);
  });

  it('throws for an unsupported serialization version', () => {
    expect(() => TemporalGraph.import({ version: 2 as 1, cursorIndex: 0, entries: [] })).toThrow();
  });

  it('supports further appends after import', () => {
    const restored = TemporalGraph.import<User, Follow, AppEvent>(build().export());
    expect(() =>
      restored.append({ snapshot: 4, mutations: [setUser('carol', CAROL)] }),
    ).not.toThrow();
    expect(restored.getNode('carol')).toEqual(CAROL);
  });
});
