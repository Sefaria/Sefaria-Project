// Prerender equals client render (PLAN Phase 2 "Must pass"): for every one of the 61 operations, the HTML that
// scripts/prerender-endpoints.ts writes (renderEndpointHtml) is the HTML the browser shows once <Endpoint> mounts
// with createRoot, so replacing the prerendered markup changes nothing a visitor sees.
//
// Two differences are inherent to the renderers and normalized: React's text separators (`<!-- -->`) in server
// output, and useId values (server and client use different prefixes), which are renamed in order of appearance.
import { render } from '@testing-library/react';
import { Endpoint } from '../Endpoint';
import { allOperations } from '../test/specs';
import { PRERENDER_API_ORIGIN, renderEndpointHtml } from './entry';

vi.setConfig({ testTimeout: 60_000 });

/** A canonical serialization of `html` parsed as DOM: attributes sorted, adjacent text merged, select values. */
function canonical(root: Element): string {
  root.normalize();
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(JSON.stringify(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    // The server marks the chosen <option> `selected`; the client sets the select's value property instead.
    const attrs = [...el.attributes]
      .filter((a) => !(el.tagName === 'OPTION' && a.name === 'selected'))
      .map((a) => `${a.name}=${JSON.stringify(a.value)}`);
    if (el instanceof HTMLSelectElement) attrs.push(`(value)=${JSON.stringify(el.value)}`);
    attrs.sort();
    out.push(`<${el.tagName.toLowerCase()}${attrs.length > 0 ? ' ' : ''}${attrs.join(' ')}>`);
    el.childNodes.forEach(walk);
    out.push(`</${el.tagName.toLowerCase()}>`);
  };
  root.childNodes.forEach(walk);
  return out.join('\n');
}

function normalize(root: Element): string {
  const ids = new Map<string, string>();
  return canonical(root).replace(/«[^»]*»|_[rR]_[0-9a-zA-Z]+_|:[rR][0-9a-z]+:/g, (id) => {
    let name = ids.get(id);
    if (name === undefined) {
      name = `id${ids.size}`;
      ids.set(id, name);
    }
    return name;
  });
}

beforeEach(() => window.localStorage.clear());

describe('prerendered endpoint HTML equals the client render', () => {
  const ops = allOperations();

  it('covers all 61 operations', () => {
    expect(ops).toHaveLength(61);
  });

  it.each(ops.map((op) => [op.operationId, op] as const))('%s', (_id, op) => {
    const server = renderEndpointHtml(op);
    const { container, unmount } = render(<Endpoint op={op} apiOrigin={PRERENDER_API_ORIGIN} />);
    const client = normalize(container);
    unmount();
    // The prerendered HTML as the browser parses it (Django includes it as markup).
    const parsed = document.createElement('div');
    parsed.innerHTML = server.replace(/<!-- -->/g, '');
    expect(normalize(parsed)).toBe(client);
  });
});
