// @vitest-environment node
// S-2 (PLAN §6.7): the Try It URL builder cannot produce a URL outside `<origin>/api/` for any parameter value, for
// every operation. The origin is a constant; every value is encoded with encodeURIComponent.
import { endpointForm, initialValues, type FormValues } from '../model/fields';
import { allOperations, operation } from '../test/specs';
import { describeRequest, fillPath, toHar, tryItUrl, UnsafeRequestUrlError } from './request';

const ORIGIN = 'https://www.sefaria.org';
const ADVERSARIAL = [
  '..',
  '.',
  '../..',
  '../../admin',
  '%2e%2e',
  '%2E%2e/%2e%2e',
  '.%2e',
  '/etc/passwd',
  'a/../../b',
  '..\\..\\x',
  '?admin=1#frag',
  '#',
  '@evil.example',
  '//evil.example/x',
  'https://evil.example/',
  'javascript:alert(1)',
  ' \t\n',
  '\u0000',
  'Genesis 1:1',
  'שמות ב',
  '{tref}',
  '%',
  '&a=b',
];

function assertSafe(url: string) {
  expect(url.startsWith(`${ORIGIN}/api/`)).toBe(true);
  const parsed = new URL(url);
  expect(parsed.origin).toBe(ORIGIN);
  expect(parsed.pathname.startsWith('/api/')).toBe(true);
}

describe('tryItUrl (S-2)', () => {
  it('every operation path starts with /api/', () => {
    for (const op of allOperations()) expect(op.path.startsWith('/api/')).toBe(true);
  });

  it.each(allOperations().map((op) => [op.operationId, op] as const))(
    '%s stays under <origin>/api/ for adversarial values',
    (_id, op) => {
      const form = endpointForm(op);
      for (const value of ADVERSARIAL) {
        const values: FormValues = { ...initialValues(form) };
        for (const field of [...form.path, ...form.query]) values[field.key] = value;
        let url: string;
        try {
          url = tryItUrl(ORIGIN, describeRequest(op, form, values));
        } catch (error) {
          // Only a whole-segment dot value is refused, and then nothing is sent.
          expect(error).toBeInstanceOf(UnsafeRequestUrlError);
          expect(form.path.length).toBeGreaterThan(0);
          expect(/^(\.|%2e){1,2}$/i.test(encodeURIComponent(value))).toBe(true);
          continue;
        }
        assertSafe(url);
      }
    }
  );

  it('encodes path values with encodeURIComponent and keeps the template for empty ones', () => {
    expect(fillPath('/api/v3/texts/{tref}', { tref: 'Genesis 1:1/../x?y' })).toBe(
      `/api/v3/texts/${encodeURIComponent('Genesis 1:1/../x?y')}`
    );
    expect(fillPath('/api/v3/texts/{tref}', { tref: '' })).toBe('/api/v3/texts/{tref}');
    const op = operation('get-v3-texts');
    const form = endpointForm(op);
    const url = tryItUrl(
      ORIGIN,
      describeRequest(op, form, { ...initialValues(form), 'query:version': 'hebrew|Miqra' })
    );
    expect(url).toBe(`${ORIGIN}/api/v3/texts/Esther%201.1?version=hebrew%7CMiqra`);
  });

  it('has no way to change the origin: it is the constant passed in', () => {
    const op = operation('get-v3-texts');
    const form = endpointForm(op);
    const url = tryItUrl('https://staging.example.org', describeRequest(op, form, initialValues(form)));
    expect(new URL(url).origin).toBe('https://staging.example.org');
  });
});

describe('describeRequest and the HAR for code samples', () => {
  it('builds the find-refs body as live does ({"text":{}}) and adds the content type', () => {
    const op = operation('post-find-refs');
    const form = endpointForm(op);
    const request = describeRequest(op, form, initialValues(form));
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ mimeType: 'application/json', text: '{"text":{}}' });
    expect(request.headers).toEqual([
      { name: 'accept', value: 'application/json' },
      { name: 'content-type', value: 'application/json' },
    ]);
    const filled = describeRequest(op, form, {
      ...initialValues(form),
      'body:text.body': 'Genesis 1:1',
      'body:lang': 'en',
    });
    expect(JSON.parse(filled.body!.text)).toEqual({ text: { body: 'Genesis 1:1' }, lang: 'en' });
  });

  it('uses the response media type for accept (image/png on get-img-gen)', () => {
    const op = operation('get-img-gen');
    const form = endpointForm(op);
    const har = toHar(describeRequest(op, form, initialValues(form)), op.server);
    expect(har.headers).toEqual([{ name: 'accept', value: 'image/png' }]);
    expect(har.url).toBe('https://www.sefaria.org/api/img-gen/Esther%201.1');
  });
});
