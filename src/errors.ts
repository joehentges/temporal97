export class CursorNotAtHeadError extends Error {
  constructor(method: string) {
    super(`${method}() requires the cursor to be at head. Call seekTo(head) first.`);
    this.name = 'CursorNotAtHeadError';
  }
}

export class SnapshotOrderError extends Error {
  constructor(method: string, given: number, current: number) {
    super(`${method}() snapshot ${given} is before current ${current}.`);
    this.name = 'SnapshotOrderError';
  }
}

export class SeekDirectionError extends Error {
  constructor(method: 'advance' | 'rewind') {
    const hint = method === 'advance' ? 'rewind() or seekTo()' : 'advance() or seekTo()';
    const direction = method === 'advance' ? 'before' : 'after';
    super(`${method}() target is ${direction} current. Use ${hint}.`);
    this.name = 'SeekDirectionError';
  }
}

export class EntityNotFoundError extends Error {
  constructor(kind: 'node' | 'edge', id: string, snapshot: number) {
    super(`Cannot delete ${kind} "${id}": not present at snapshot ${snapshot}.`);
    this.name = 'EntityNotFoundError';
  }
}

export class UnsupportedVersionError extends Error {
  constructor(version: number) {
    super(`Unsupported serialization version: ${version}.`);
    this.name = 'UnsupportedVersionError';
  }
}
