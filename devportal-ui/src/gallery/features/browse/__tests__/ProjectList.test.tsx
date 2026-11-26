import { render as rtlRender, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { ProjectList } from '../ProjectList';
import { makeProject } from '../../../test/factories';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const projects = [
  makeProject({ id: 1, project_name: 'Fine' }),
  makeProject({ id: 2, project_name: 'Broken', is_buggy: true }),
];

describe('ProjectList', () => {
  it('links every narrow row to its project page, with no bug icon', () => {
    const { container } = render(<ProjectList projects={projects} activeCategory="all" />);
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', '/powered-by/projects/1-fine');
    expect(within(rows[1]!).getByRole('link')).toHaveAttribute('href', '/powered-by/projects/2-broken');
    expect(screen.queryByRole('img', { name: 'Known issues' })).toBeNull();
    expect(container.querySelector('.lucide-bug')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ProjectList projects={projects} activeCategory="all" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
