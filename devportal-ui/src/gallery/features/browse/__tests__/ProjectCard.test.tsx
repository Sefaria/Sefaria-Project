import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectCard } from '../ProjectCard';
import { makeProject } from '../../../test/factories';

const project = makeProject({
  project_name: 'Talmud Helper',
  project_desc: 'Study aid for the daf.',
  project_category: 'AI Projects, Apps, & Other Tools Learning & Study Tools',
  tags: ['English', 'Gemara', 'AI', 'Tanakh', 'Hebrew'],
  project_source_code: 'https://github.com/x/y',
  sefaria_tools_used: ['/api/texts'],
  tech_used_raw: 'React',
  technical_experience: 'None',
  vibe_coded: true,
  status: 'live',
  featured: true,
});

function renderCard(overrides: Partial<Parameters<typeof ProjectCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProjectCard project={project} activeCategory="all" resultIndex={0} {...overrides} />
    </MemoryRouter>
  );
}

const topicTagsCss = readFileSync(join(process.cwd(), 'src/gallery/features/browse/TopicTags.module.css'), 'utf8');

describe('ProjectCard', () => {
  it('renders exactly the category label, title, description and up to 3 topics (no English)', () => {
    const { container } = renderCard();
    const card = container.querySelector('article') as HTMLElement;
    expect(within(card).getByText('AI & Apps')).toBeInTheDocument();
    expect(within(card).getByRole('heading', { level: 3, name: 'Talmud Helper' })).toBeInTheDocument();
    expect(within(card).getByText('Study aid for the daf.')).toBeInTheDocument();
    const tags = within(card).getByTestId('topic-tags');
    expect([...tags.children].map((t) => t.textContent)).toEqual(['Gemara', 'AI', 'Tanakh']);
    // nothing else: the title link to the project page and the visit link
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).getAllByRole('link')).toHaveLength(2);
    expect(card.textContent).not.toMatch(/github|React|Texts|\/api|2026|live|vibe/i);
  });

  it('keeps the tag row to a single clipped line', () => {
    renderCard();
    // jsdom applies no layout, so assert the row's class and that its CSS holds the clamp.
    expect(screen.getByTestId('topic-tags')).toHaveClass('rowSm');
    const rule = /\.rowSm,\s*\.rowXs\s*{([^}]*)}/.exec(topicTagsCss)?.[1] ?? '';
    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(/\.rowSm\s*{([^}]*)}/.exec(topicTagsCss)?.[1]).toMatch(/height:\s*28px/);
  });

  it('shows the filtered category instead of the first one', () => {
    renderCard({ activeCategory: 'learn' });
    expect(screen.getByText('Learning & Study')).toBeInTheDocument();
  });

  it('links the title to the project page', () => {
    renderCard();
    expect(screen.getByRole('link', { name: 'Talmud Helper' })).toHaveAttribute(
      'href',
      `/powered-by/projects/${project.id}-talmud-helper`
    );
  });

  it('has no bug icon, even for a project with known issues', () => {
    const { container } = renderCard({ project: makeProject({ is_buggy: true }) });
    expect(screen.queryByRole('img', { name: 'Known issues' })).toBeNull();
    expect(container.querySelector('.lucide-bug')).toBeNull();
  });

  it('has an external visit link for a healthy project', () => {
    renderCard();
    const link = screen.getByRole('link', { name: 'Visit Talmud Helper (opens in a new tab)' });
    expect(link).toHaveAttribute('href', project.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('title', 'Open project');
  });

  it('has an internal arrow to the project page for a known-issues project', () => {
    renderCard({ project: makeProject({ id: 7, project_name: 'Old App', is_buggy: true }) });
    const link = screen.getByRole('link', { name: 'About Old App' });
    expect(link).toHaveAttribute('href', '/powered-by/projects/7-old-app');
    expect(link).not.toHaveAttribute('target');
    expect(screen.queryByRole('link', { name: /Visit Old App/ })).toBeNull();
  });

  it('omits the visit link when a healthy project has no URL', () => {
    renderCard({ project: { ...project, url: null } });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('colors the icon tile from the category token, not a hard-coded purple', () => {
    const { container } = renderCard({ activeCategory: 'learn' });
    const tile = container.querySelector('article span[aria-hidden="true"]') as HTMLElement;
    expect(tile.style.getPropertyValue('--tile-color')).toBe('var(--category-learn)');
  });

  it('has no axe violations', async () => {
    const { container } = renderCard();
    expect(await axe(container)).toHaveNoViolations();
  });
});
