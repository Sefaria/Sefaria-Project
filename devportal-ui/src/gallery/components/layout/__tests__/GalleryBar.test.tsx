// Was SiteHeader.test.tsx. The gallery's header became the portal header (PLAN §2.14 item 5); these are its
// checks for what moved into the gallery page: the wordmark home link, "Submit a project" and "Donate".
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { DONATE_URL, SUBMIT_URL } from '../../../lib/links';
import { GalleryBar } from '../GalleryBar';

const renderBar = (backLink?: { to: string; label: string }) =>
  render(
    <MemoryRouter initialEntries={['/powered-by/charts']}>
      <GalleryBar backLink={backLink} />
    </MemoryRouter>
  );

describe('GalleryBar', () => {
  it('links the wordmark to the gallery root', () => {
    renderBar();
    expect(screen.getByRole('link', { name: 'Powered by Sefaria' })).toHaveAttribute('href', '/powered-by');
  });

  it('is a navigation landmark named for the gallery', () => {
    renderBar();
    expect(screen.getByRole('navigation', { name: 'Powered by Sefaria' })).toBeInTheDocument();
  });

  it('renders the submit link to the Formstack form in a new tab', () => {
    renderBar();
    const links = screen.getAllByRole('link', { name: 'Submit a project (opens in a new tab)' });
    expect(links).toHaveLength(1);
    for (const link of links) {
      expect(link).toHaveAttribute('href', SUBMIT_URL);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveTextContent('(opens in a new tab)');
    }
  });

  it('announces Donate as opening in a new tab', () => {
    renderBar();
    const donate = screen.getByRole('link', { name: /Donate\s*\(opens in a new tab\)/ });
    expect(donate).toHaveAttribute('href', DONATE_URL);
    expect(donate).toHaveAttribute('target', '_blank');
    expect(donate).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows the back link first when given', () => {
    renderBar({ to: '/powered-by', label: 'All projects' });
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('All projects');
    expect(links[0]).toHaveAttribute('href', '/powered-by');
  });

  it('has no axe violations', async () => {
    const { container } = renderBar({ to: '/powered-by', label: 'All projects' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
