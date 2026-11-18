import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { SidebarTree } from '../contracts';
import { DocsSidebarTree } from './DocsSidebarTree';
import { readJson } from './test-utils';

const tree = readJson<SidebarTree>('devportal/contracts/fixtures/shapes/sidebar-tree/docs.json');

function renderTree(activePath: string) {
  return render(
    <nav aria-label="Secondary navigation">
      <DocsSidebarTree tree={tree} activePath={activePath} />
    </nav>
  );
}

describe('DocsSidebarTree', () => {
  it('renders one section per category with its heading', async () => {
    renderTree('/docs/welcome');
    for (const category of tree.categories) {
      expect(screen.getByRole('region', { name: category.title })).toBeInTheDocument();
    }
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('marks the current page and opens the groups on its branch only', () => {
    renderTree('/docs/linker-v3');
    const current = screen.getByRole('link', { name: 'Embed Linker v3 on Your Site' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveClass('dp-active');
    const toggle = screen.getByRole('button', { name: 'Hide subpages for The Sefaria Linker' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Every other group starts closed.
    for (const other of screen.queryAllByRole('button', { name: /^Show subpages for / })) {
      expect(other).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById(other.getAttribute('aria-controls')!)).not.toBeVisible();
    }
  });

  it('toggles a group with its button', async () => {
    renderTree('/docs/welcome');
    const toggle = screen.getByRole('button', { name: 'Show subpages for The Sefaria Linker' });
    const list = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(list).not.toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Hide subpages for The Sefaria Linker');
    expect(list).toBeVisible();
    expect(within(list).getByRole('link', { name: 'Embed Linker v3 on Your Site' })).toBeInTheDocument();
  });

  it('shows the external arrow on link items and opens new-tab links in a new tab', () => {
    renderTree('/docs/welcome');
    const links = tree.categories.flatMap((c) => c.items).filter((i) => i.kind === 'link');
    expect(links.length).toBeGreaterThan(0);
    for (const item of links) {
      const a = screen.getByRole('link', { name: item.title });
      expect(a.querySelector('svg.dp-sidebar-external')).toHaveAttribute('aria-hidden', 'true');
      expect(a).toHaveAttribute('href', item.href);
      if (item.newTab) {
        expect(a).toHaveAttribute('target', '_blank');
        expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      } else expect(a).not.toHaveAttribute('target');
    }
    const page = screen.getByRole('link', { name: "Welcome to Sefaria's Technical Documentation" });
    expect(page.querySelector('svg')).toBeNull();
  });

  it('marks deprecated pages', () => {
    renderTree('/docs/linker-v2');
    expect(screen.getAllByRole('button', { name: 'Deprecated Doc' }).length).toBeGreaterThan(0);
  });
});
