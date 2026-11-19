import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SIDEBAR_ID } from '../../app/PortalPage';
import { PortalHeader } from './PortalHeader';
import { HEADER_VARIANT_KEYS, SUBNAV_CONTROLS, headerVariants, renderHeader } from './prerender';

/**
 * Serializes a DOM tree with attributes sorted, so the two renderers compare as DOM, not as strings
 * (the server writes `<hr/>` and `hidden=""` where the DOM serializer writes `<hr>`; attribute order
 * is not significant).
 */
function canonical(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return JSON.stringify(node.textContent);
  if (!(node instanceof Element)) return '';
  const attrs = [...node.attributes].map((attr) => `${attr.name}=${JSON.stringify(attr.value)}`).sort();
  return `<${node.localName} ${attrs.join(' ')}>${[...node.childNodes].map(canonical).join('')}</${node.localName}>`;
}

/** The prerendered string as the browser parses it (Django includes it in the page). */
function serverDom(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.childNodes].map(canonical).join('');
}

/** What the browser renders for the same props (createRoot, as src/app/mount.tsx does). */
function clientDom(props: Parameters<typeof PortalHeader>[0]): string {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<PortalHeader {...props} />));
  const dom = [...container.childNodes].map(canonical).join('');
  act(() => root.unmount());
  return dom;
}

describe('prerendered header', () => {
  const variants = headerVariants();

  it('has a plain, a sub-nav and a 404 variant for every tab and for none', () => {
    expect(variants.map((variant) => variant.file).sort()).toEqual(
      HEADER_VARIANT_KEYS.flatMap((key) => [
        `header-${key}.html`,
        `header-${key}-subnav.html`,
        `header-notfound-${key}.html`,
      ]).sort()
    );
  });

  it.each(variants.map((variant) => [variant.file, variant] as const))(
    '%s equals the client render',
    (_file, variant) => {
      const html = renderHeader(variant.props);
      expect(html.startsWith('<header')).toBe(true);
      expect(serverDom(html)).toBe(clientDom(variant.props));
    }
  );

  it('controls the sidebar column the app renders', () => {
    expect(SUBNAV_CONTROLS).toBe(SIDEBAR_ID);
  });
});
