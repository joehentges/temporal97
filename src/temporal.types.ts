export type SnapshotId = number;
export type EntityId = string;

export interface BaseEdgeData {
  source: EntityId;
  target: EntityId;
}

export interface Neighbor<TEdge extends BaseEdgeData> {
  nodeId: EntityId;
  edgeId: EntityId;
  edge: TEdge;
}

export enum MutationKindEnum {
  Node = 'node',
  Edge = 'edge',
}
export type MutationKind = keyof typeof MutationKindEnum;

export enum MutationOperationEnum {
  Set = 'set',
  Delete = 'delete',
}
export type MutationOperation = keyof typeof MutationOperationEnum;

export type NodeSetMutation<TNode> = {
  kind: MutationKindEnum.Node;
  op: MutationOperationEnum.Set;
  id: EntityId;
  value: TNode;
  prev: TNode | undefined;
};
export type NodeSetMutationInput<TNode> = Omit<NodeSetMutation<TNode>, 'prev'>;

export type NodeDeleteMutation<TNode> = {
  kind: MutationKindEnum.Node;
  op: MutationOperationEnum.Delete;
  id: EntityId;
  prev: TNode;
};
export type NodeDeleteMutationInput<TNode> = Omit<NodeDeleteMutation<TNode>, 'prev'>;

export type EdgeSetMutation<TEdge extends BaseEdgeData> = {
  kind: MutationKindEnum.Edge;
  op: MutationOperationEnum.Set;
  id: EntityId;
  value: TEdge;
  prev: TEdge | undefined;
};
export type EdgeSetMutationInput<TEdge extends BaseEdgeData> = Omit<EdgeSetMutation<TEdge>, 'prev'>;

export type EdgeDeleteMutation<TEdge extends BaseEdgeData> = {
  kind: MutationKindEnum.Edge;
  op: MutationOperationEnum.Delete;
  id: EntityId;
  prev: TEdge;
};
export type EdgeDeleteMutationInput<TEdge extends BaseEdgeData> = Omit<
  EdgeDeleteMutation<TEdge>,
  'prev'
>;

export type Mutation<TNode, TEdge extends BaseEdgeData> =
  | NodeSetMutation<TNode>
  | NodeDeleteMutation<TNode>
  | EdgeSetMutation<TEdge>
  | EdgeDeleteMutation<TEdge>;

export type MutationInput<TNode, TEdge extends BaseEdgeData> =
  | NodeSetMutationInput<TNode>
  | NodeDeleteMutationInput<TNode>
  | EdgeSetMutationInput<TEdge>
  | EdgeDeleteMutationInput<TEdge>;

export interface LogEntry<TNode, TEdge extends BaseEdgeData, TEvent> {
  snapshot: SnapshotId;
  event: TEvent | undefined;
  mutations: Mutation<TNode, TEdge>[];
}

export interface RawEntryInput<TNode, TEdge extends BaseEdgeData> {
  snapshot: SnapshotId;
  mutations: MutationInput<TNode, TEdge>[];
}

export interface RichEntryInput<TNode, TEdge extends BaseEdgeData, TEvent>
  extends RawEntryInput<TNode, TEdge> {
  event: TEvent;
}

export type EntryInput<TNode, TEdge extends BaseEdgeData, TEvent> =
  | RichEntryInput<TNode, TEdge, TEvent>
  | RawEntryInput<TNode, TEdge>;

export interface SerializedTemporalGraph<
  TNode = unknown,
  TEdge extends BaseEdgeData = BaseEdgeData,
  TEvent = unknown,
> {
  version: 1;
  cursorIndex: number;
  entries: LogEntry<TNode, TEdge, TEvent>[];
}
