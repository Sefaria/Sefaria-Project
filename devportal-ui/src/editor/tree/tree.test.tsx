import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { EditorTree, EditorTreeNode } from '../../contracts';
import { flatten, projectMove } from './flatten';
import { PageTree } from './PageTree';

function node(
  id: number,
  title: string,
  kind: EditorTreeNode['kind'] = 'page',
  children: EditorTreeNode[] = []
): EditorTreeNode {
  return {
    id,
    kind,
    title,
    slug: kind === 'category' ? null : title.toLowerCase(),
    hidden: false,
    deprecated: false,
    hasDraft: false,
    isPublished: true,
    method: null,
    operationId: null,
    children,
  };
}

//  1 TECHNICAL DOCS        depth 0
//    2 Welcome             depth 1
//      3 Child             depth 2
//    4 Second              depth 1
//  5 GUIDES                depth 0
//    6 Guide               depth 1
const TREE: EditorTree = {
  contractVersion: 1,
  section: 'docs',
  generation: 7,
  nodes: [
    node(1, 'TECHNICAL DOCS', 'category', [node(2, 'Welcome', 'page', [node(3, 'Child')]), node(4, 'Second')]),
    node(5, 'GUIDES', 'category', [node(6, 'Guide')]),
  ],
};

describe('flatten', () => {
  it('lists the tree in order with depths and parents', () => {
    expect(flatten(TREE.nodes).map((f) => [f.id, f.depth, f.parentId, f.index])).toEqual([
      [1, 0, null, 0],
      [2, 1, 1, 0],
      [3, 2, 2, 0],
      [4, 1, 1, 1],
      [5, 0, null, 1],
      [6, 1, 5, 0],
    ]);
  });
});

describe('projectMove', () => {
  const flat = flatten(TREE.nodes);

  it('reorders siblings', () => {
    expect(projectMove(flat, 4, 2, 0)).toEqual({ parentId: 1, position: 0, depth: 1 });
  });

  it('moves a page into another category', () => {
    expect(projectMove(flat, 4, 6, 0)).toEqual({ parentId: 5, position: 1, depth: 1 });
  });

  it('nests under the page above when dragged to the right', () => {
    expect(projectMove(flat, 4, 4, 0)).toBeNull();
    expect(projectMove(flat, 4, 4, 20)).toEqual({ parentId: 2, position: 1, depth: 2 });
    expect(projectMove(flat, 4, 4, 40)).toEqual({ parentId: 3, position: 0, depth: 3 });
  });

  it('un-nests when dragged to the left', () => {
    expect(projectMove(flat, 3, 3, -20)).toEqual({ parentId: 1, position: 1, depth: 1 });
  });

  it('moves a subtree with its root', () => {
    expect(projectMove(flat, 2, 6, 0)).toEqual({ parentId: 5, position: 1, depth: 1 });
  });
});

describe('PageTree', () => {
  function renderTree() {
    const props = { onSelect: vi.fn(), onCreate: vi.fn(), onMove: vi.fn(), onDelete: vi.fn() };
    const view = render(<PageTree tree={TREE} selectedId={2} {...props} />);
    return { view, ...props };
  }

  it('shows the pages, the selection and the actions', async () => {
    const { onSelect, onCreate, onDelete } = renderTree();
    const nav = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(nav).getByRole('button', { name: 'Welcome' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(nav).getByRole('button', { name: 'Guide' }));
    expect(onSelect).toHaveBeenCalledWith(6);
    await userEvent.click(within(nav).getByRole('button', { name: 'Add a page under Welcome' }));
    expect(onCreate).toHaveBeenCalledWith(2, 'page');
    await userEvent.click(within(nav).getByRole('button', { name: '+ New category' }));
    expect(onCreate).toHaveBeenCalledWith(null, 'category');
    expect(within(nav).queryByRole('button', { name: 'Delete Welcome' })).toBeNull(); // has a child
    await userEvent.click(within(nav).getByRole('button', { name: 'Delete Child' }));
    expect(onDelete).toHaveBeenCalledWith(3);
  });

  it('picks a page up with the keyboard and announces it', async () => {
    const { view } = renderTree();
    const handle = screen.getByRole('button', { name: 'Move Second' });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    handle.focus();
    await userEvent.keyboard('[Space]');
    // jsdom has no layout, so where a keyboard drag lands is covered by projectMove above and DEV-EDIT in a browser.
    expect(view.baseElement.textContent).toMatch(/Picked up Second\.|Second is over /);
    await userEvent.keyboard('[Escape]');
  });

  it('has no axe violations', async () => {
    const { view } = renderTree();
    expect(await axe(view.container)).toHaveNoViolations();
  });
});
