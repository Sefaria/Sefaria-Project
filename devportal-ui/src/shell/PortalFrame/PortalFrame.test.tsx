import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { PortalFrame } from './PortalFrame';
import { NotFoundPage } from '../NotFoundPage/NotFoundPage';

describe('PortalFrame', () => {
  it('reference: main holds the sidebar, article#content and the playground beside it', async () => {
    const { container } = render(
      <PortalFrame
        layout="reference"
        sidebarId="dp-sidebar"
        sidebar={<nav aria-label="Secondary navigation">tree</nav>}
        rail={<p>playground</p>}
      >
        <h1>Texts (v3)</h1>
      </PortalFrame>
    );
    const main = screen.getByRole('main');
    expect(main).toHaveClass('dp-rm-app');
    expect(main).toHaveAttribute('data-layout', 'reference');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('id', 'content');
    expect(article).toContainElement(screen.getByRole('heading', { level: 1 }));
    const sidebar = container.querySelector('#dp-sidebar')!;
    expect(sidebar).toContainElement(screen.getByRole('navigation', { name: 'Secondary navigation' }));
    expect(sidebar).not.toHaveAttribute('data-open');
    const playground = screen.getByText('playground').parentElement!;
    expect(playground).toHaveClass('dp-rm-playground');
    expect(article).not.toContainElement(playground);
    expect(article.parentElement).toBe(playground.parentElement);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('docs: the rail sits inside the article, after the body', () => {
    render(
      <PortalFrame layout="docs" sidebar={<nav aria-label="Secondary navigation" />} rail={<p>toc</p>}>
        <p>body</p>
      </PortalFrame>
    );
    const article = screen.getByRole('article');
    expect(article).toContainElement(screen.getByText('toc'));
    expect(screen.getByText('body').compareDocumentPosition(screen.getByText('toc'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('marks the sidebar open for the mobile panel', () => {
    const { container } = render(
      <PortalFrame layout="docs" sidebarId="dp-sidebar" sidebarOpen sidebar={<p>tree</p>}>
        <p>body</p>
      </PortalFrame>
    );
    expect(container.querySelector('#dp-sidebar')).toHaveAttribute('data-open', 'true');
  });

  it('plain: no sidebar and no rail even when given', () => {
    render(
      <PortalFrame layout="plain" sidebar={<p>tree</p>} rail={<p>rail</p>}>
        <p>body</p>
      </PortalFrame>
    );
    expect(screen.queryByText('tree')).toBeNull();
    expect(screen.queryByText('rail')).toBeNull();
    expect(screen.getByRole('article')).toHaveTextContent('body');
  });
});

describe('NotFoundPage (I-14)', () => {
  const suggestions = [
    { title: 'Get a lexicon entry', path: '/reference/get-lexicon-entry' },
    { title: 'Topic Ontology', path: '/docs/topic-ontology' },
    { title: 'Category Creation', path: '/docs/category-creation' },
  ];

  it('shows "Page Not Found", the prompt and the three suggestions', async () => {
    const { container } = render(
      <PortalFrame layout="plain">
        <NotFoundPage suggestions={suggestions} />
      </PortalFrame>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument();
    expect(screen.getByText('Maybe you were looking for one of these:')).toBeInTheDocument();
    const links = screen.getAllByRole('listitem').map((item) => item.querySelector('a')!);
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      suggestions.map((s) => [s.title, s.path])
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows at most three suggestions, and no prompt without any', () => {
    const { rerender } = render(
      <NotFoundPage suggestions={[...suggestions, { title: 'Fourth', path: '/docs/fourth' }]} />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    rerender(<NotFoundPage suggestions={[]} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText(/Maybe you were looking/)).toBeNull();
  });
});
