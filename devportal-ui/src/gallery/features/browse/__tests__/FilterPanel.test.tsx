import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { CLEARED_VALUES, DEFAULT_FILTERS, filterFacets, type Filters } from '../../../lib/filter';
import { FilterPanel } from '../FilterPanel';
import { ActiveFilters } from '../ActiveFilters';
import { fixtureProjects, makeProject } from '../../../test/factories';

const topicNames = Array.from({ length: 14 }, (_, i) => `Topic ${String(i + 1).padStart(2, '0')}`);
const many = [
  // Topic 01 is on the most projects, Topic 14 on the fewest
  ...topicNames.map((_, i) =>
    makeProject({
      id: i + 1,
      tags: topicNames.slice(0, topicNames.length - i),
      project_name: `P${i}`,
    })
  ),
];

function Harness({
  projects = many,
  initial = DEFAULT_FILTERS,
  large,
}: {
  projects?: typeof many;
  initial?: Filters;
  large?: boolean;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <>
      <ActiveFilters
        filters={filters}
        onChange={(p) => setFilters((f) => ({ ...f, ...p }))}
        onClearAll={() => setFilters((f) => ({ ...f, ...CLEARED_VALUES, q: '' }))}
      />
      <FilterPanel
        large={large}
        facets={filterFacets(projects, filters)}
        filters={filters}
        onChange={(p) => setFilters((f) => ({ ...f, ...p }))}
      />
    </>
  );
}

const header = (name: RegExp | string) => screen.getByRole('button', { name });

describe('FilterPanel disclosures', () => {
  it('keeps Category and Display open (no buttons), and starts the others collapsed', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /^Category/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Display' })).toBeInTheDocument();
    for (const name of ['Topics', 'Language', 'Sefaria resources', 'Built with']) {
      expect(header(name)).toHaveAttribute('aria-expanded', 'false');
      expect(header(name)).toHaveAttribute('aria-controls');
    }
  });

  it('opens a section from its header and points aria-controls at the body', async () => {
    render(<Harness />);
    await userEvent.click(header('Topics'));
    expect(header('Topics')).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(header('Topics').getAttribute('aria-controls') as string);
    expect(body).not.toBeNull();
    expect(within(body as HTMLElement).getByRole('group', { name: 'Topics' })).toBeInTheDocument();
    await userEvent.click(header('Topics'));
    expect(header('Topics')).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts open, with the number selected in the header, when a section has a selection', () => {
    render(<Harness initial={{ ...DEFAULT_FILTERS, topics: ['Topic 01', 'Topic 02'], tech: [] }} />);
    expect(header('Topics · 2')).toHaveAttribute('aria-expanded', 'true');
    expect(header('Language')).toHaveAttribute('aria-expanded', 'false');
  });

  it('updates the header count as values are picked', async () => {
    render(<Harness />);
    await userEvent.click(header('Topics'));
    await userEvent.click(screen.getByRole('checkbox', { name: /Topic 01/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Topic 02/ }));
    expect(header('Topics · 2')).toBeInTheDocument();
  });

  it('makes Category and Display collapsible in the large (sheet) variant', () => {
    render(<Harness large />);
    expect(header('Category')).toHaveAttribute('aria-expanded', 'true');
    expect(header('Display')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('FilterPanel long lists', () => {
  it('shows the top 8 by count, then "Show all n" expands the list', async () => {
    render(<Harness />);
    await userEvent.click(header('Topics'));
    const group = screen.getByRole('group', { name: 'Topics' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(8);
    expect(within(group).getAllByRole('checkbox')[0]).toHaveAccessibleName(/Topic 01/);
    await userEvent.click(screen.getByRole('button', { name: 'Show all 14' }));
    expect(within(group).getAllByRole('checkbox')).toHaveLength(14);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('has no Show all button for 8 options or fewer', async () => {
    render(<Harness projects={[makeProject({ tags: ['A', 'B'] })]} />);
    await userEvent.click(header('Topics'));
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('keeps a selected option visible even beyond the top 8', () => {
    render(<Harness initial={{ ...DEFAULT_FILTERS, topics: ['Topic 14'] }} />);
    expect(screen.getByRole('checkbox', { name: /Topic 14/ })).toBeChecked();
  });

  it('offers "Filter topics" only above 12 options, and filters by text', async () => {
    const { unmount } = render(<Harness projects={[makeProject({ tags: ['A', 'B'] })]} />);
    await userEvent.click(header('Topics'));
    expect(screen.queryByRole('searchbox', { name: 'Filter topics' })).toBeNull();
    unmount();

    render(<Harness />);
    await userEvent.click(header('Topics'));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter topics' }), '12');
    const group = screen.getByRole('group', { name: 'Topics' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(group).getByRole('checkbox', { name: /Topic 12/ })).toBeInTheDocument();
  });

  it('shows each option with its live count', async () => {
    render(<Harness />);
    await userEvent.click(header('Topics'));
    expect(screen.getByRole('checkbox', { name: 'Topic 01 14' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Topic 08 7' })).toBeInTheDocument();
  });
});

describe('FilterPanel Display switch', () => {
  it('is a real switch, off by default', () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Show projects with known issues' });
    expect(toggle.tagName).toBe('INPUT');
    expect(toggle).toHaveAttribute('type', 'checkbox');
    expect(toggle).not.toBeChecked();
  });
  it('turns on and off', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch');
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
  });
});

describe('ActiveFilters chips', () => {
  const selected: Filters = {
    ...DEFAULT_FILTERS,
    category: 'ai',
    topics: ['Topic 01'],
    languages: ['English'],
    resources: ['Texts'],
    tech: ['React'],
  };

  it('renders one chip per value with a removal label', () => {
    render(<Harness initial={selected} projects={fixtureProjects} />);
    const chips = within(screen.getByRole('list', { name: 'Active filters' }));
    for (const label of ['AI & Apps', 'Topic 01', 'Language: English', 'Resource: Texts', 'Built with: React']) {
      expect(chips.getByRole('button', { name: `Remove filter: ${label}` })).toBeInTheDocument();
    }
  });

  it('removes just that value and keeps the others', async () => {
    render(<Harness initial={{ ...selected, topics: ['Topic 01', 'Topic 02'] }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Topic 01' }));
    expect(screen.queryByRole('button', { name: 'Remove filter: Topic 01' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove filter: Topic 02' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Built with: React' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: AI & Apps' }));
    expect(screen.getByRole('radio', { name: /All projects/ })).toBeChecked();
  });

  it('clears every value with Clear all, but not the display switch', async () => {
    render(<Harness initial={{ ...selected, showBuggy: true }} />);
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('renders nothing without active values', () => {
    render(<Harness />);
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull();
  });
});

describe('FilterPanel accessibility', () => {
  it('has no axe violations, collapsed or fully open', async () => {
    const { container } = render(<Harness projects={fixtureProjects} />);
    expect(await axe(container)).toHaveNoViolations();
    for (const name of ['Topics', 'Language', 'Sefaria resources', 'Built with']) {
      await userEvent.click(header(name));
    }
    expect(await axe(container)).toHaveNoViolations();
  });
});
