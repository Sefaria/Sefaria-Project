// W2's pieces in the page slots: the shell sidebar on docs and endpoint pages, Copy Page in the docs rail and the
// endpoint headline, the feedback widget in the page footers.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import type { DocPayload, EndpointPayload } from '../contracts';
import { createPageSlots, endpointFooter, endpointHeaderActions, renderDocPage, renderSidebar } from './slots';

const FIXTURES = resolve(import.meta.dirname, '../../../devportal/contracts/fixtures/shapes/page-payload');
const fixture = <T,>(name: string) => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as T;
const FRAME = { sidebarId: 'dp-sidebar', sidebarOpen: false };

describe('shell slots (W2)', () => {
  it('draws the docs page with the shell sidebar column, Copy Page in the rail and feedback in the footer', () => {
    const doc = fixture<DocPayload>('doc');
    const slots = createPageSlots();
    const { container } = render(<>{renderDocPage(doc, FRAME, slots)}</>);
    // One sidebar: the shell's, in the column the mobile sub-nav controls; DocPage draws none of its own.
    const column = container.querySelector('.dp-docs-frame > .dp-docs__sidebar#dp-sidebar')!;
    expect(within(column as HTMLElement).getByRole('navigation', { name: 'Secondary navigation' })).toHaveClass(
      'dp-sidebar--app'
    );
    expect(screen.getAllByRole('navigation', { name: 'Secondary navigation' })).toHaveLength(1);
    expect(column.querySelector('[data-discord-placement="sidebar_footer"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="copy-page"]')).toContainElement(
      screen.getByRole('button', { name: 'Copy Page' })
    );
    expect(container.querySelector('[data-slot="feedback"]')).toContainElement(
      screen.getByRole('button', { name: 'Yes, this page helped me' })
    );
  });

  it('draws a custom page without sidebar or Copy Page, with feedback', () => {
    const custom = fixture<DocPayload>('doc-custom-page');
    render(<>{renderDocPage(custom, FRAME, createPageSlots())}</>);
    expect(screen.queryByRole('navigation', { name: 'Secondary navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy Page' })).toBeNull();
    expect(screen.getByRole('button', { name: 'No, this page did not help me' })).toBeInTheDocument();
  });

  it('gives endpoint pages the reference sidebar, Copy Page and the footer with feedback', () => {
    const endpoint = fixture<EndpointPayload>('endpoint');
    render(
      <>
        {renderSidebar(endpoint)}
        {endpointHeaderActions(endpoint)}
        {endpointFooter(endpoint)}
      </>
    );
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).toHaveAttribute('id', 'reference-sidebar');
    expect(screen.getByRole('button', { name: 'Copy Page options' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination Controls' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next Page: Texts (v1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, this page helped me' })).toBeInTheDocument();
    // No Discord at the end of endpoint pages (D-7 is docs only).
    expect(document.querySelector('[data-discord-placement="docs_page_end"] a')).toBeNull();
  });
});
