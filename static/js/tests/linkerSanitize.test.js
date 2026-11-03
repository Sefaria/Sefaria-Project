/**
 * linker.v3 sanitizeElem: reduces page markup to plain text before it is used for matching.
 * Inputs include mutation-XSS style fixtures (markup that changes meaning when re-parsed).
 * The output must never carry markup or event-handler text downstream.
 */
import DOMPurify from 'dompurify';
import { sanitizeElem } from '../linker.v3/sanitize';

const elemFrom = (html) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

const MARKUP_OR_HANDLER = /<\s*[a-z!\/]|on[a-z]+\s*=|javascript:/i;

describe('linker sanitizeElem', () => {
  test('runs on the DOMPurify 3.1.6+ line', () => {
    const [major, minor, patch] = DOMPurify.version.split('.').map(Number);
    const atLeast316 = major > 3 || (major === 3 && (minor > 1 || (minor === 1 && patch >= 6)));
    expect(atLeast316).toBe(true);
  });

  test('keeps readable text from ordinary markup', () => {
    expect(sanitizeElem(elemFrom('<p>Genesis <b>1:1</b> begins</p>'))).toBe('Genesis 1:1 begins');
  });

  test('drops script bodies entirely', () => {
    expect(sanitizeElem(elemFrom('plain<script>alert(1)</script>text'))).toBe('plaintext');
  });

  test.each([
    ['style-namespace confusion', '<p>ok</p><style><img src=x onerror=alert(1)></style>'],
    ['math/table mutation', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
    ['svg foreign content', '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>"></a>'],
    ['form and math nesting', '<form><math><mtext></form><form><mglyph><style></math><img src=x onerror=alert(1)>'],
    ['noscript attribute break', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
    ['iframe srcdoc payload', '<iframe srcdoc="<img src=x onerror=alert(1)>"></iframe>text'],
  ])('neutralises %s', (_name, payload) => {
    const out = sanitizeElem(elemFrom(payload));
    expect(out).not.toMatch(MARKUP_OR_HANDLER);
    expect(out).not.toMatch(/onerror/i);
  });

  test('output re-parses as inert text with no live elements', () => {
    const out = sanitizeElem(elemFrom('<p>a</p><style><img src=x onerror=alert(1)></style><svg><g/></svg>'));
    const reparsed = elemFrom(out);
    expect(reparsed.querySelector('img,svg,style,script,iframe')).toBeNull();
  });
});
