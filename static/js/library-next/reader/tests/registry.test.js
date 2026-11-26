import { registerReaderTool, unregisterReaderTool, getReaderTool, getReaderTools, subscribeReaderTools, _resetReaderTools } from '../tools/registry';

const C = () => null;
beforeEach(() => _resetReaderTools());

test('validates definitions', () => {
  expect(() => registerReaderTool({})).toThrow(/id/);
  expect(() => registerReaderTool({ id: 'x', label: { en: 'X', he: 'X' } })).toThrow(/component/);
  expect(() => registerReaderTool({ id: 'x', component: C })).toThrow(/label/);
  expect(() => registerReaderTool({ id: 'x', component: C, label: 'x', personas: ['wizard'] })).toThrow(/personas/);
  expect(() => registerReaderTool({ id: 'x', component: C, label: 'x', personas: [] })).toThrow(/personas/);
  const t = registerReaderTool({ id: 'x', component: C, label: 'x' });
  expect(t.personas).toBe('all');
  expect(getReaderTool('x')).toBe(t);
  expect(getReaderTool('nope')).toBeNull();
});

test('persona filtering and ordering: persona list first, then registration order', () => {
  registerReaderTool({ id: 'connections', component: C, label: 'c' });
  registerReaderTool({ id: 'shelf', component: C, label: 's' });
  registerReaderTool({ id: 'cite', component: C, label: 'ci', personas: ['scholar', 'educator'] });
  registerReaderTool({ id: 'note', component: C, label: 'n', personas: ['learner'] });
  registerReaderTool({ id: 'versions', component: C, label: 'v', personas: ['scholar'] });
  expect(getReaderTools('newcomer').map(t => t.id)).toEqual(['connections', 'shelf']);
  expect(getReaderTools('learner').map(t => t.id)).toEqual(['note', 'connections', 'shelf']);
  expect(getReaderTools('scholar').map(t => t.id)).toEqual(['versions', 'cite', 'connections', 'shelf']);
  expect(getReaderTools('educator').map(t => t.id)).toEqual(['connections', 'shelf', 'cite']);
});

test('re-registering replaces; subscribers hear changes; unregister', () => {
  const seen = [];
  const off = subscribeReaderTools(list => seen.push(list.map(t => t.id).join(',')));
  registerReaderTool({ id: 'a', component: C, label: 'a' });
  const D = () => null;
  registerReaderTool({ id: 'a', component: D, label: 'a2' });
  expect(getReaderTools('newcomer')).toHaveLength(1);
  expect(getReaderTool('a').component).toBe(D);
  expect(unregisterReaderTool('a')).toBe(true);
  expect(unregisterReaderTool('a')).toBe(false);
  expect(seen).toEqual(['a', 'a', '']);
  off();
});
