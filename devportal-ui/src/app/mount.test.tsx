import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { axe } from 'vitest-axe';
import { mount } from './mount';
import { PageDataError, readPageData } from './data';

const FIXTURES = resolve(import.meta.dirname, '../../../devportal/contracts/fixtures/shapes/page-payload');

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8');
}

/** Builds the markup Django renders: the mount point and the json_script data island. */
function renderShell(json: string | null): void {
  document.body.innerHTML = '<div id="dp-root"><p>server markup</p></div>';
  if (json !== null) {
    const island = document.createElement('script');
    island.type = 'application/json';
    island.id = 'dp-data';
    island.textContent = json;
    document.body.appendChild(island);
  }
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readPageData', () => {
  it('reads the payload from #dp-data', () => {
    renderShell(fixture('doc'));
    const data = readPageData(document);
    expect(data?.kind).toBe('doc');
    expect(data?.path).toBe('/docs/welcome');
  });

  it('returns null when the page has no data island', () => {
    renderShell(null);
    expect(readPageData(document)).toBeNull();
  });

  it('rejects an island that is not JSON', () => {
    renderShell('{not json');
    expect(() => readPageData(document)).toThrow(PageDataError);
  });

  it('rejects JSON that is not a page payload', () => {
    renderShell('{"kind": "doc"}');
    expect(() => readPageData(document)).toThrow(PageDataError);
  });
});

describe('mount', () => {
  it('replaces the server markup in #dp-root with the app', async () => {
    renderShell(fixture('doc'));
    let root: ReturnType<typeof mount> = null;
    await act(async () => {
      root = mount(document);
    });
    expect(root).not.toBeNull();
    const container = document.getElementById('dp-root')!;
    expect(container).not.toHaveTextContent('server markup');
    expect(container.querySelector('.dp-app')).toHaveAttribute('data-kind', 'doc');
    expect(container.querySelector('header')).toBeInTheDocument();
    expect(container.querySelector('main article#content h1')).toHaveTextContent(
      "Welcome to Sefaria's Technical Documentation"
    );
    expect(container.querySelector('main.dp-main #dp-article-body')).toHaveTextContent('What is Sefaria?');
    expect(container.querySelector('#dp-sidebar nav[aria-label="Secondary navigation"]')).not.toBeNull();
    expect(document.title).toBe("Welcome to Sefaria's Technical Documentation");
    expect(await axe(container)).toHaveNoViolations();
    act(() => root!.unmount());
  });

  it('adopts the server-rendered body nodes instead of re-parsing them', async () => {
    renderShell(fixture('doc'));
    const server = document.getElementById('dp-root')!;
    server.innerHTML =
      '<main><div class="dp-markdown" id="dp-article-body"><p>server body</p><img alt="kept" src="data:,"></div></main>';
    const image = server.querySelector('img')!;
    let root: ReturnType<typeof mount> = null;
    await act(async () => {
      root = mount(document);
    });
    const body = document.getElementById('dp-article-body')!;
    expect(body).toHaveTextContent('server body');
    expect(body.querySelector('img')).toBe(image);
    expect(image.isConnected).toBe(true);
    act(() => root!.unmount());
  });

  it('does nothing when the page has no #dp-root', () => {
    document.body.innerHTML = '';
    expect(mount(document)).toBeNull();
  });
});
