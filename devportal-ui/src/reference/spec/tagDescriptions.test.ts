// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { allOperations } from '../test/specs';
import { TAG_DESCRIPTIONS } from './tagDescriptions';

describe('TAG_DESCRIPTIONS', () => {
  it('equals the tags of docs/openAPI.json', () => {
    const spec = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../docs/openAPI.json'), 'utf8')) as {
      tags: { name: string; description?: string }[];
    };
    expect(TAG_DESCRIPTIONS).toEqual(Object.fromEntries(spec.tags.map((t) => [t.name, t.description ?? ''])));
  });

  it('describes every tag an operation uses', () => {
    for (const op of allOperations()) for (const tag of op.tags) expect(TAG_DESCRIPTIONS[tag], tag).toBeDefined();
  });
});
