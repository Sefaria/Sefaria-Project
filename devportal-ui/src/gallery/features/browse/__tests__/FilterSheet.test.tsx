import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTERS } from '../../../lib/filter';
import { FilterSheet } from '../FilterSheet';
import { makeProject } from '../../../test/factories';

const projects = [
  makeProject({ id: 1, project_category: 'Learning & Study Tools' }),
  makeProject({
    id: 2,
    project_category: 'Learning & Study Tools',
    tags: ['Gemara', 'Hebrew'],
    tech_used_raw: 'React',
  }),
  makeProject({ id: 3, project_category: 'AI Projects, Apps, & Other Tools', tags: ['Gemara'] }),
  makeProject({ id: 4, project_category: 'AI Projects, Apps, & Other Tools', is_buggy: true }),
];

/** The sheet's sections are collapsed disclosures; open one by its header. */
const openSection = (name: RegExp) => userEvent.click(screen.getByRole('button', { name }));

function setup() {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <FilterSheet projects={projects} filters={DEFAULT_FILTERS} onApply={onApply} onClose={onClose} />
  );
  return { onApply, onClose, ...utils };
}

describe('FilterSheet', () => {
  it('starts from the current filters and shows the live count on the Show button', () => {
    setup();
    expect(screen.getByRole('radio', { name: /All projects/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Show 3 projects' })).toBeInTheDocument();
  });

  it('updates the count with the pending selection without applying it', async () => {
    const { onApply } = setup();
    await userEvent.click(screen.getByRole('radio', { name: /AI & Apps/ }));
    expect(screen.getByRole('button', { name: 'Show 1 project' })).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies the selection on Show', async () => {
    const { onApply, onClose } = setup();
    await userEvent.click(screen.getByRole('radio', { name: /Learning & Study/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 projects' }));
    expect(onApply).toHaveBeenCalledWith({
      q: '',
      category: 'learn',
      topics: [],
      languages: [],
      resources: [],
      tech: [],
      showBuggy: false,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('discards the selection when closed without Show', async () => {
    const { onApply, onClose } = setup();
    await userEvent.click(screen.getByRole('radio', { name: /AI & Apps/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Clear all resets the pending selection', async () => {
    setup();
    await userEvent.click(screen.getByRole('radio', { name: /AI & Apps/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('radio', { name: /All projects/ })).toBeChecked();
  });

  it('makes every section collapsible, with the filters collapsed unless selected', () => {
    setup();
    for (const name of ['Category', 'Display']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'true');
    }
    for (const name of ['Topics', 'Language', 'Sefaria resources', 'Built with']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('updates the live count and the section header from a pending topic, then applies it', async () => {
    const { onApply } = setup();
    await openSection(/^Topics$/);
    await userEvent.click(screen.getByRole('checkbox', { name: /Gemara/ }));
    expect(screen.getByRole('button', { name: /^Topics · 1$/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Show 2 projects' })).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 projects' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ topics: ['Gemara'] }));
  });

  it('combines sections in the live count (OR within, AND across)', async () => {
    setup();
    await openSection(/^Topics$/);
    await openSection(/^Built with$/);
    await userEvent.click(screen.getByRole('checkbox', { name: /Gemara/ }));
    expect(screen.getByRole('button', { name: 'Show 2 projects' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /React/ }));
    expect(screen.getByRole('button', { name: 'Show 1 project' })).toBeInTheDocument();
  });

  it('counts projects with known issues only after the switch is turned on', async () => {
    setup();
    const toggle = screen.getByRole('switch', { name: 'Show projects with known issues' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show 4 projects' })).toBeInTheDocument();
  });

  it('discards pending filter and display changes on close', async () => {
    const { onApply, onClose } = setup();
    await openSection(/^Language$/);
    await userEvent.click(screen.getByRole('checkbox', { name: /Hebrew/ }));
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Clear all also clears the multi-select values', async () => {
    setup();
    await openSection(/^Topics$/);
    await userEvent.click(screen.getByRole('checkbox', { name: /Gemara/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('checkbox', { name: /Gemara/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Show 3 projects' })).toBeInTheDocument();
  });

  it('Clear all also clears the search, but leaves the display switch alone', async () => {
    const onApply = vi.fn();
    render(
      <FilterSheet
        projects={projects}
        filters={{ ...DEFAULT_FILTERS, q: 'gemara', showBuggy: true }}
        onApply={onApply}
        onClose={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('switch')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /^Show \d+ projects?$/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ q: '', showBuggy: true }));
  });

  it('has no axe violations', async () => {
    setup();
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });

  it('has no axe violations with every section open', async () => {
    setup();
    for (const name of [/^Topics$/, /^Language$/, /^Sefaria resources$/, /^Built with$/]) {
      await openSection(name);
    }
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
