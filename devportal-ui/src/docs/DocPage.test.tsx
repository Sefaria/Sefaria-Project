import { act, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { DocPayload } from '../contracts';
import { DocPage } from './DocPage';
import { BODY_ELEMENT_ID, takeServerBody } from './adopt';
import { golden, readJson } from './test-utils';
import type { Tokenizer } from './highlight';

const base = readJson<DocPayload>('devportal/contracts/fixtures/shapes/page-payload/doc.json');
const custom = readJson<DocPayload>('devportal/contracts/fixtures/shapes/page-payload/doc-custom-page.json');
// No CodeMirror in these tests: highlighting has its own.
const enhance = { loadTokenizer: () => new Promise<Tokenizer>(() => {}) };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('takeServerBody', () => {
  it('detaches the server body nodes so they can be moved, not re-parsed', () => {
    document.body.innerHTML = `<div id="${BODY_ELEMENT_ID}" class="dp-markdown"><p>one</p><img src="https://x/a.png" alt=""></div>`;
    const img = document.querySelector('img');
    const nodes = takeServerBody(document)!;
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toBe(img);
    expect(document.getElementById(BODY_ELEMENT_ID)!.childNodes).toHaveLength(0);
    expect(takeServerBody(new DOMParser().parseFromString('<p></p>', 'text/html'))).toBeNull();
  });
});

describe('DocPage', () => {
  it('lays out sidebar, article and rail, with the body enhanced', async () => {
    const data = { ...base, page: { ...base.page, bodyHtml: golden('09-code') + golden('04-headings') } };
    render(
      <main>
        <DocPage data={data} enhance={enhance} now={new Date('2026-11-18T00:00:00Z')} />
      </main>
    );
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: data.page.title })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Table of Contents' })).toBeInTheDocument();
    const body = document.getElementById(BODY_ELEMENT_ID)!;
    expect(body.querySelectorAll('[role="tablist"]').length).toBeGreaterThan(0);
    expect(body.querySelectorAll('.dp-code-copy').length).toBe(body.querySelectorAll('pre').length);
    expect(document.querySelector('[data-discord-placement="docs_page_end"]')).toBeInTheDocument();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('adopts the server nodes instead of the payload HTML', () => {
    const p = document.createElement('p');
    p.textContent = 'from the server';
    render(<DocPage data={base} adopt={[p]} enhance={enhance} />);
    expect(document.getElementById(BODY_ELEMENT_ID)!.firstChild).toBe(p);
  });

  it('replaces and re-enhances the body on client-side navigation', () => {
    const { rerender } = render(<DocPage data={base} enhance={enhance} />);
    const next = { ...base, page: { ...base.page, bodyHtml: '<pre><code>new</code></pre>' } };
    act(() => rerender(<DocPage data={next} enhance={enhance} />));
    const body = document.getElementById(BODY_ELEMENT_ID)!;
    expect(body).toHaveTextContent('new');
    expect(body.querySelectorAll('.dp-code-copy')).toHaveLength(1);
  });

  it('renders custom pages without sidebar or rail', () => {
    render(<DocPage data={custom} enhance={enhance} />);
    expect(screen.queryByRole('navigation', { name: 'Secondary navigation' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Table of Contents' })).toBeNull();
    expect(document.querySelector('.dp-docs--custom')).toBeInTheDocument();
  });
});
