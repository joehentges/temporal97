import { MutationKindEnum, MutationOperationEnum } from '../temporal.types';
import { TemporalGraph } from '../temporal-graph';

export type User = { name: string; role: 'admin' | 'user' };
export type Follow = { source: string; target: string; since: number };
export type AppEvent = { type: string };

const NODE = MutationKindEnum.Node;
const EDGE = MutationKindEnum.Edge;
const SET = MutationOperationEnum.Set;
const DEL = MutationOperationEnum.Delete;

export function setUser(id: string, value: User) {
  return { kind: NODE, op: SET, id, value } as const;
}
export function delUser(id: string) {
  return { kind: NODE, op: DEL, id } as const;
}
export function setFollow(id: string, source: string, target: string, since = 0) {
  return { kind: EDGE, op: SET, id, value: { source, target, since } } as const;
}
export function delFollow(id: string) {
  return { kind: EDGE, op: DEL, id } as const;
}

export const ALICE: User = { name: 'Alice', role: 'admin' };
export const ALICE_V2: User = { name: 'Alice', role: 'user' };
export const BOB: User = { name: 'Bob', role: 'user' };
export const CAROL: User = { name: 'Carol', role: 'user' };

export function newGraph() {
  return new TemporalGraph<User, Follow, AppEvent>();
}
