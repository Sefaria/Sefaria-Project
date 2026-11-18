// Test helper: the C3 operation files built in memory from docs/openAPI.json (the build writes the same files to
// public/spec/, which is git-ignored and absent before a build).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSpec } from '../spec/buildSpec';
import type { OperationSpec } from '../../contracts';

let cache: OperationSpec[] | null = null;

export function allOperations(): OperationSpec[] {
  if (cache === null) {
    const text = readFileSync(resolve(import.meta.dirname, '../../../../docs/openAPI.json'), 'utf8');
    cache = buildSpec(text, 'test').operations;
  }
  return cache;
}

export function operation(operationId: string): OperationSpec {
  const op = allOperations().find((o) => o.operationId === operationId);
  if (op === undefined) throw new Error(`no operation ${operationId}`);
  return op;
}
