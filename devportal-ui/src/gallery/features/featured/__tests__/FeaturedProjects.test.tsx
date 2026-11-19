import { render as rtlRender, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { FeaturedProjects } from '../FeaturedProjects';
import { makeProject } from '../../../test/factories';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const projects = [
  makeProject({
    id: 1,
    project_name: 'Torah MCP',
    project_desc: 'Ask your AI about Torah.',
    project_category: 'AI Projects, Apps, & Other Tools',
    project_link: 'https://www.torah.example/mcp',
    sefaria_tools_used: ['Sefaria API', '/api/v3/texts', '/api/related'],
    tags: ['AI', 'Chatbot'],
    featured: true,
  }),
  makeProject({
    id: 2,
    project_name: "Today's Daf",
    project_category: 'Learning & Study Tools',
    featured: true,
    is_buggy: true,
  }),
];

describe('FeaturedProjects', () => {
  it('renders nothing for an empty list: no band and no heading', () => {
    const { container } = render(<FeaturedProjects projects={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: 'Featured Projects' })).toBeNull();
  });

  it('is a section labelled by its heading, with the subtitle', () => {
    const { container } = render(<FeaturedProjects projects={projects} />);
    const band = container.querySelector('section') as HTMLElement;
    const heading = within(band).getByRole('heading', { level: 2, name: 'Featured Projects' });
    expect(heading).toHaveAttribute('id', 'featured-heading');
    expect(band).toHaveAttribute('aria-labelledby', 'featured-heading');
    expect(within(band).getByText('Hand-picked by the Developers on Sefaria team')).toBeInTheDocument();
  });

  it('shows each card: category art, label, title link, description and "Made with", no tags', () => {
    render(<FeaturedProjects projects={projects} />);
    const card = screen.getByRole('heading', { level: 3, name: 'Torah MCP' }).closest('article');
    expect(card).not.toBeNull();
    const inCard = within(card as HTMLElement);
    expect(inCard.getByText('AI & Apps')).toBeInTheDocument();
    expect(inCard.getByRole('link', { name: 'Torah MCP' })).toHaveAttribute('href', '/powered-by/projects/1-torah-mcp');
    expect(inCard.getByText('Ask your AI about Torah.')).toBeInTheDocument();
    expect(inCard.getByText('Made with')).toBeInTheDocument();
    expect(inCard.getByText('Sefaria API · /api/v3/texts')).toBeInTheDocument();
    expect(screen.queryByText('torah.example')).toBeNull();
    expect(card?.textContent).not.toMatch(/Chatbot/);
    const art = (card as HTMLElement).querySelector('img') as HTMLImageElement;
    expect(art).toHaveAttribute('src', `${import.meta.env.BASE_URL}gallery/category-art/ai.svg`);
    expect(art).toHaveAttribute('alt', '');
    expect(art).toHaveAttribute('loading', 'lazy');
  });

  it('falls back to "Sefaria texts" when no resources are listed', () => {
    render(<FeaturedProjects projects={projects} />);
    const card = screen.getByRole('heading', { level: 3, name: "Today's Daf" }).closest('article');
    expect(within(card as HTMLElement).getByText('Sefaria texts')).toBeInTheDocument();
  });

  it('uses the primary category image, and the none image without a category', () => {
    render(<FeaturedProjects projects={[makeProject({ id: 9, project_name: 'Plain', project_category: null })]} />);
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      `${import.meta.env.BASE_URL}gallery/category-art/none.svg`
    );
  });

  it('shows an arrow to the project page, not the site, for a known-issues project', () => {
    render(<FeaturedProjects projects={projects} />);
    expect(screen.getByRole('link', { name: "About Today's Daf" })).toHaveAttribute(
      'href',
      '/powered-by/projects/2-todays-daf'
    );
    expect(screen.getByRole('link', { name: 'Visit Torah MCP (opens in a new tab)' })).toHaveAttribute(
      'href',
      'https://www.torah.example/mcp'
    );
  });

  it('makes the sideways scroller a focusable, named region below 900px', () => {
    // jsdom matches no media query, so this is the < 900px layout
    const { container } = render(<FeaturedProjects projects={projects} />);
    const scroller = container.querySelector('div[role="region"]');
    expect(scroller).toHaveAttribute('aria-label', 'Featured Projects, scrollable');
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(within(scroller as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('has no axe violations', async () => {
    const { container } = render(<FeaturedProjects projects={projects} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
