import { highlight, tokenClass } from './highlight';

describe('highlight (CodeMirror 5 runMode)', () => {
  it('tokenizes a cURL sample like live (builtin, attribute, string)', () => {
    const lines = highlight("curl --request GET \\\n     --header 'accept: application/json'", 'shell');
    expect(lines[0]).toEqual([
      { text: 'curl', style: 'builtin' },
      { text: ' ', style: null },
      { text: '--request', style: 'attribute' },
      { text: ' GET \\', style: null },
    ]);
    expect(lines[1]!.map((t) => t.style)).toEqual([null, 'attribute', null, 'string']);
  });

  it('tokenizes JSON with property, string and number styles', () => {
    const lines = highlight('{\n  "a": "b",\n  "n": 2\n}', { name: 'javascript', json: true });
    expect(lines).toHaveLength(4);
    expect(lines[1]!.find((t) => t.text === '"a"')!.style).toBe('string property');
    expect(lines[2]!.find((t) => t.text === '2')!.style).toBe('number');
  });

  it('maps styles to dp-cm- classes', () => {
    expect(tokenClass('string property')).toBe('dp-cm-string dp-cm-property');
    expect(tokenClass(null)).toBeUndefined();
  });
});
