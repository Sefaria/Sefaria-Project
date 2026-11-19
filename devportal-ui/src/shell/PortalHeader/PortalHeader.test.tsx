import { render, screen, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { HeaderTab } from '../../contracts';
import { PortalHeader, SEARCH_OPEN_EVENT } from './PortalHeader';
import type { PortalHeaderTab } from './headerLinks';

// The header's tab type is its own (it imports nothing from the portal); it must stay C3's HeaderTab.
const sameTabs: [PortalHeaderTab, HeaderTab] extends [HeaderTab, PortalHeaderTab] ? true : never = true;

const PRIMARY = [
  ['Home', '/', null],
  ['Docs', '/docs', null],
  ['API Reference', '/reference', null],
  ['Projects Powered by Sefaria', '/powered-by', null],
  ['GitHub', 'https://github.com/Sefaria/Sefaria-Project', '_blank'],
  ['Donate', 'https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=HeaderDev', '_blank'],
  ['Get in Touch', '/page/contact-us', null],
] as const;

/** A link's name: its aria-label (a link with a short label carries the full one there), else its text. */
function accessibleName(link: HTMLElement) {
  return link.getAttribute('aria-label') ?? link.textContent;
}

function primaryNav() {
  return screen.getByRole('navigation', { name: 'Primary navigation' });
}

describe('PortalHeader', () => {
  it('keeps the tab type equal to C3', () => {
    expect(sameTabs).toBe(true);
  });

  it('is the banner, with the skip link first and the logo linking home', () => {
    render(<PortalHeader activeTab={null} />);
    const banner = screen.getByRole('banner');
    const skip = screen.getByRole('link', { name: 'Jump to Content' });
    expect(skip).toHaveAttribute('href', '#content');
    expect(banner.querySelector('a')).toBe(skip);
    const logos = screen.getAllByRole('img', { name: 'Developers on Sefaria' });
    expect(logos[0]!.closest('a')).toHaveAttribute('href', '/');
    expect(logos[0]).toHaveAttribute('src', '/logo-developers-on-sefaria-white.svg');
  });

  it("has live's six primary links, plus the gallery, with their targets", () => {
    render(<PortalHeader activeTab={null} />);
    const links = within(primaryNav()).getAllByRole('link');
    expect(links.map(accessibleName)).toEqual(PRIMARY.map(([label]) => label));
    for (const [label, href, target] of PRIMARY) {
      const link = within(primaryNav()).getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', href);
      if (target) {
        expect(link).toHaveAttribute('target', target);
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      } else {
        expect(link).not.toHaveAttribute('target');
      }
    }
  });

  it.each([
    ['home', 'Home'],
    ['docs', 'Docs'],
    ['reference', 'API Reference'],
    ['gallery', 'Projects Powered by Sefaria'],
    ['contact', 'Get in Touch'],
  ] as const)('marks the %s tab active', (tab, label) => {
    render(<PortalHeader activeTab={tab} />);
    const current = within(primaryNav())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map(accessibleName)).toEqual([label]);
  });

  it('marks no tab active when there is none', () => {
    render(<PortalHeader activeTab={null} />);
    expect(primaryNav().querySelector('[aria-current]')).toBeNull();
  });

  it('dispatches the search event from the search toggle, whose key hint is CTRL-K off Apple platforms', async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener(SEARCH_OPEN_EVENT, listener);
    render(<PortalHeader activeTab={null} />);
    const toggle = screen.getByRole('button', { name: 'Search ⌘k' });
    expect(toggle).toHaveTextContent('SearchCTRL-K');
    await user.click(toggle);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SEARCH_OPEN_EVENT, listener);
  });

  it('shows ⌘K on Apple platforms', () => {
    const spy = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    render(<PortalHeader activeTab={null} />);
    expect(screen.getByRole('button', { name: 'Search ⌘k' })).toHaveTextContent('⌘K');
    spy.mockRestore();
  });

  describe('links menu', () => {
    const ITEMS = [
      ['Sefaria Library', 'https://sefaria.org', 'library'],
      ['Voices at Sefaria', 'https://voices.sefaria.org', 'voices'],
      ['Developers', 'https://developers.sefaria.org', 'developers'],
      ['More from Sefaria ›', 'https://sefaria.org/products', null],
    ] as const;

    it("opens by mouse with live's four items, labels and dots, and closes by mouse", async () => {
      const user = userEvent.setup();
      render(
        <>
          <PortalHeader activeTab={null} />
          <main>
            <p>outside</p>
          </main>
        </>
      );
      const button = screen.getByRole('button', { name: 'Open links menu' });
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('dialog')).toBeNull();

      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      const menu = screen.getByRole('dialog', { name: 'Links menu' });
      const links = within(menu).getAllByRole('link');
      expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('data-dot')])).toEqual(
        ITEMS
      );
      for (const link of links) expect(link).not.toHaveAttribute('target');
      expect(await axe(document.body)).toHaveNoViolations();

      await user.click(button);
      expect(screen.queryByRole('dialog')).toBeNull();

      await user.click(button);
      await user.click(screen.getByText('outside'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens by keyboard, moves focus into the menu, and Escape closes it with focus back on the button', async () => {
      const user = userEvent.setup();
      render(<PortalHeader activeTab={null} />);
      const button = screen.getByRole('button', { name: 'Open links menu' });
      button.focus();
      await user.keyboard('{Enter}');
      const menu = screen.getByRole('dialog', { name: 'Links menu' });
      expect(within(menu).getByRole('link', { name: 'Sefaria Library' })).toHaveFocus();
      await user.tab();
      expect(within(menu).getByRole('link', { name: 'Voices at Sefaria' })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(button).toHaveFocus();

      await user.keyboard(' ');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(button).toHaveFocus();
    });

    it('closes when focus leaves it', async () => {
      const user = userEvent.setup();
      render(
        <>
          <PortalHeader activeTab={null} />
          <button type="button">after</button>
        </>
      );
      await user.click(screen.getByRole('button', { name: 'Open links menu' }));
      for (let i = 0; i < 4; i += 1) await user.tab();
      expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe("this environment's sites", () => {
    const html = document.documentElement;
    afterEach(() => {
      delete html.dataset.dpLibraryUrl;
      delete html.dataset.dpVoicesUrl;
      delete html.dataset.dpDevelopersUrl;
    });

    it('links the menu and the drawer to the addresses Django puts on <html>', async () => {
      html.dataset.dpLibraryUrl = 'https://www.rebuild.cauldron.sefaria.org';
      html.dataset.dpVoicesUrl = 'https://voices.rebuild.cauldron.sefaria.org';
      html.dataset.dpDevelopersUrl = 'https://developers.rebuild.cauldron.sefaria.org';
      const user = userEvent.setup();
      render(<PortalHeader activeTab={null} />);
      await user.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
      expect(screen.getByRole('link', { name: 'Sefaria Library' })).toHaveAttribute(
        'href',
        'https://www.rebuild.cauldron.sefaria.org'
      );
      expect(screen.getByRole('link', { name: 'Voices on Sefaria' })).toHaveAttribute(
        'href',
        'https://voices.rebuild.cauldron.sefaria.org'
      );
      await user.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
      await user.click(screen.getByRole('button', { name: /links/i }));
      const menu = screen.getByRole('dialog', { name: 'Links menu' });
      expect(
        within(menu)
          .getAllByRole('link')
          .map((link) => link.getAttribute('href'))
      ).toEqual([
        'https://www.rebuild.cauldron.sefaria.org',
        'https://voices.rebuild.cauldron.sefaria.org',
        'https://developers.rebuild.cauldron.sefaria.org',
        'https://www.rebuild.cauldron.sefaria.org/products',
      ]);
    });
  });

  describe('mobile drawer', () => {
    const DRAWER = [
      ['Home', '/', null],
      ['Docs', '/docs', null],
      ['API Reference', '/reference', null],
      ['Projects Powered by Sefaria', '/powered-by', null],
      ['GitHub', 'https://github.com/Sefaria/Sefaria-Project', '_blank'],
      ['Donate', 'https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=HeaderDev', '_blank'],
      ['Get in Touch', '/page/contact-us', null],
      ['Sefaria Library', 'https://sefaria.org', '_blank'],
      ['Voices on Sefaria', 'https://voices.sefaria.org', '_blank'],
    ] as const;

    it('toggles the drawer with its nine links and the logo, marking the active tab', async () => {
      const user = userEvent.setup();
      const { container } = render(<PortalHeader activeTab="reference" />);
      const toggle = screen.getByRole('button', { name: 'Toggle navigation menu' });
      const drawer = container.querySelector<HTMLElement>(`#${toggle.getAttribute('aria-controls')}`)!;
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(drawer).not.toBeVisible();

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(drawer).toBeVisible();
      const links = within(drawer).getAllByRole('link');
      expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('target')])).toEqual([
        ...DRAWER,
        ['', '/', null],
      ]);
      expect(within(links[9]!).getByRole('img', { name: 'Developers on Sefaria' })).toBeInTheDocument();
      expect(within(drawer).getByRole('link', { name: 'API Reference' })).toHaveAttribute('aria-current', 'page');
      expect(await axe(container)).toHaveNoViolations();

      await user.click(toggle);
      expect(drawer).not.toBeVisible();
    });

    it('closes on Escape with focus on the toggle, and when a link is followed', async () => {
      const user = userEvent.setup();
      const { container } = render(<PortalHeader activeTab="docs" />);
      const toggle = screen.getByRole('button', { name: 'Toggle navigation menu' });
      const drawer = container.querySelector<HTMLElement>('#dp-mobile-drawer')!;
      await user.click(toggle);
      await user.tab();
      expect(within(drawer).getByRole('link', { name: 'Home' })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(drawer).not.toBeVisible();
      expect(toggle).toHaveFocus();

      await user.click(toggle);
      const docs = within(drawer).getByRole('link', { name: 'Docs' });
      docs.addEventListener('click', (event) => event.preventDefault());
      await user.click(docs);
      expect(drawer).not.toBeVisible();
    });

    it('shows the section name next to the hamburger, and nothing on custom pages', () => {
      const { container, rerender } = render(<PortalHeader activeTab="reference" />);
      expect(container.querySelector('.sectionLabel')).toHaveTextContent('API Reference');
      rerender(<PortalHeader activeTab="contact" />);
      expect(container.querySelector('.sectionLabel')).toBeNull();
    });
  });

  describe('sub-nav button', () => {
    it('is absent on pages without a sidebar', () => {
      render(<PortalHeader activeTab="home" />);
      expect(screen.queryByRole('button', { name: /Texts/ })).toBeNull();
    });

    it('shows the page title and reports its state', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      const { rerender } = render(
        <PortalHeader
          activeTab="reference"
          subnav={{ label: 'Texts (v3)', expanded: false, onToggle, controls: 'dp-sidebar' }}
        />
      );
      const button = screen.getByRole('button', { name: 'Texts (v3)' });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveAttribute('aria-controls', 'dp-sidebar');
      await user.click(button);
      expect(onToggle).toHaveBeenCalledTimes(1);
      rerender(
        <PortalHeader
          activeTab="reference"
          subnav={{ label: 'Texts (v3)', expanded: true, onToggle, controls: 'dp-sidebar' }}
        />
      );
      expect(screen.getByRole('button', { name: 'Texts (v3)' })).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <PortalHeader activeTab="docs" subnav={{ label: 'Welcome', expanded: false, onToggle: () => {} }} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
