import type {
  BaseEdgeData,
  EntityId,
  EntryInput,
  MutationInput,
  SnapshotId,
} from './temporal.types';
import type { Delta } from './utils';

export class EntryBuilder<TNode, TEdge extends BaseEdgeData, TEvent = unknown> {
  private readonly _snapshot: SnapshotId;
  private readonly _mutations: MutationInput<TNode, TEdge>[] = [];
  private _event: TEvent | undefined = undefined;
  private readonly _commitFn: (input: EntryInput<TNode, TEdge, TEvent>) => Delta;

  constructor(snapshot: SnapshotId, commitFn: (input: EntryInput<TNode, TEdge, TEvent>) => Delta) {
    this._snapshot = snapshot;
    this._commitFn = commitFn;
  }

  event(payload: TEvent): this {
    this._event = payload;
    return this;
  }

  setNode(id: EntityId, value: TNode): this {
    this._mutations.push({ kind: 'node', op: 'set', id, value });
    return this;
  }

  deleteNode(id: EntityId): this {
    this._mutations.push({ kind: 'node', op: 'delete', id });
    return this;
  }

  setEdge(id: EntityId, value: TEdge): this {
    this._mutations.push({ kind: 'edge', op: 'set', id, value });
    return this;
  }

  deleteEdge(id: EntityId): this {
    this._mutations.push({ kind: 'edge', op: 'delete', id });
    return this;
  }

  build(): EntryInput<TNode, TEdge, TEvent> {
    const mutations = [...this._mutations];
    if (this._event !== undefined) {
      return { snapshot: this._snapshot, event: this._event, mutations };
    }
    return { snapshot: this._snapshot, mutations };
  }

  append(): Delta {
    return this._commitFn(this.build());
  }
}
