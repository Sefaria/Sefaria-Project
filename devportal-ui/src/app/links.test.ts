import { clientNavigationTarget, interceptPortalLinks, isPortalPagePath } from './links';

describe('isPortalPagePath', () => {
  it.each(['/', '/docs', '/docs/welcome', '/reference', '/reference/get-v3-texts', '/page/contact-us', '/docs/a/b'])(
    'routes %s in the app',
    (path) => expect(isPortalPagePath(path)).toBe(true)
  );

  it.each(['/docs/welcome.md', '/llms.txt', '/mcp', '/powered-by', '/editor', '/_portal/page.json', '/static/x.js'])(
    'leaves %s to the browser',
    (path) => expect(isPortalPagePath(path)).toBe(false)
  );
});

describe('interceptPortalLinks', () => {
  function setup(html: string) {
    document.body.innerHTML = html;
    const navigate = vi.fn();
    const remove = interceptPortalLinks(document, { navigate });
    return { navigate, remove };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function click(element: Element, init: MouseEventInit = {}) {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    element.dispatchEvent(event);
    return event;
  }

  it('navigates in the app for a same-origin portal link, keeping query and fragment', () => {
    const { navigate, remove } = setup('<a href="/docs/welcome?x=1#top"><span>Welcome</span></a>');
    const event = click(document.querySelector('span')!);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/docs/welcome?x=1#top');
    remove();
  });

  it('leaves new-tab, modified, external, file and same-page fragment links to the browser', () => {
    const { navigate, remove } = setup(`
      <a id="blank" href="/docs" target="_blank">a</a>
      <a id="ext" href="https://github.com/Sefaria/Sefaria-Project">b</a>
      <a id="md" href="/docs/welcome.md">c</a>
      <a id="frag" href="#section">d</a>
      <a id="dl" href="/docs" download>e</a>
      <a id="plain" href="/docs">f</a>`);
    for (const id of ['blank', 'ext', 'md', 'frag', 'dl']) click(document.getElementById(id)!);
    click(document.getElementById('plain')!, { metaKey: true });
    click(document.getElementById('plain')!, { button: 1 });
    expect(navigate).not.toHaveBeenCalled();
    remove();
  });

  it('ignores clicks a component already handled', () => {
    const anchor = document.createElement('a');
    anchor.href = '/docs';
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    event.preventDefault();
    Object.defineProperty(event, 'target', { value: anchor });
    expect(clientNavigationTarget(event, window.location)).toBeNull();
  });
});
