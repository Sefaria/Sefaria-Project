import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAnalytics, type Gtag, type StopAnalytics } from '../analytics';
import type { PagePayload } from '../contracts';
import {
  ContactPageDiscord,
  DiscordButton,
  RequestPanelDiscord,
  SidebarFooterDiscord,
  createDiscordLink,
  enhanceContactPageDiscord,
  mountDiscordPlacements,
} from '.';

const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'discord.css'), 'utf8');
const SIGNUP = 'https://sefaria.formstack.com/forms/sefaria_developer_discord_community';

/** The declarations of the first rule whose selector list contains `selector` exactly. */
function rule(selector: string): Record<string, string> {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    const out: Record<string, string> = {};
    for (const decl of match[2]!.split(';')) {
      const at = decl.indexOf(':');
      if (at > 0)
        out[decl.slice(0, at).trim()] = decl
          .slice(at + 1)
          .trim()
          .replace(/\s+/g, ' ');
    }
    return out;
  }
  throw new Error(`no rule for ${selector}`);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DiscordButton', () => {
  it('is a text-only link to the signup form that opens a new tab', async () => {
    const { container } = render(<DiscordButton placement="docs_page_end" />);
    const link = screen.getByRole('link', { name: 'Join our Discord' });
    expect(link).toHaveAttribute('href', SIGNUP);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('data-discord-cta', 'docs_page_end');
    expect(link).toHaveClass('dp-discord-button', 'dp-discord-button--primary');
    expect(link.querySelector('svg, img')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has a secondary (white) variant for purple surfaces', () => {
    render(<DiscordButton placement="home_hero" variant="secondary" />);
    expect(screen.getByRole('link')).toHaveClass('dp-discord-button--secondary');
  });

  it('uses the design-system tokens: action-primary with text-inverse, Roboto body-strong', () => {
    expect(rule('.dp-discord-button.dp-discord-button--primary')).toMatchObject({
      'background-color': 'var(--action-primary)',
      color: 'var(--text-inverse)',
    });
    expect(rule('.dp-discord-button').font).toBe('var(--text-en-system-body-strong)');
    // The secondary variant reads as the white "Sign Up" button live uses on purple (I-3).
    expect(rule('.dp-discord-button.dp-discord-button--secondary')).toMatchObject({
      'background-color': 'var(--surface-page)',
      color: 'var(--action-primary)',
    });
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('has the design-system focus ring: 2px solid functional-focus-blue, offset 2px', () => {
    expect(rule('.dp-discord-button:focus-visible')).toEqual({
      outline: '2px solid var(--functional-focus-blue)',
      'outline-offset': '2px',
    });
  });

  it('renders the placements with their placement attribute', () => {
    render(
      <>
        <SidebarFooterDiscord />
        <RequestPanelDiscord />
        <ContactPageDiscord />
      </>
    );
    const ctas = [...document.querySelectorAll('[data-discord-cta]')].map((a) => a.getAttribute('data-discord-cta'));
    expect(ctas).toEqual(['sidebar_footer', 'reference_request_panel', 'contact_page']);
    expect(screen.getByText('Questions about this endpoint?')).toBeInTheDocument();
    expect(screen.getByText('to talk with other developers building on Sefaria.')).toBeInTheDocument();
  });
});

describe('Discord clicks (C8 discord_cta_click)', () => {
  let stop: StopAnalytics;
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    const gtag: Gtag = (...args) => calls.push(args);
    const data = {
      kind: 'home',
      title: 'Sefaria',
      site: { ga4: { default: 'G-6SXQFSB219' }, analyticsSection: 'default' },
    } as unknown as PagePayload;
    stop = startAnalytics({ data, load: () => gtag });
  });

  afterEach(() => stop());

  const events = () => calls.filter((c) => c[0] === 'event' && c[1] === 'discord_cta_click');

  it('sends the placement of the React button', async () => {
    render(<DiscordButton placement="reference_request_panel" />);
    const link = screen.getByRole('link');
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(events()).toEqual([['event', 'discord_cta_click', { placement: 'reference_request_panel' }]]);
  });

  it('sends the placement of server-rendered and mounted links', async () => {
    document.body.innerHTML =
      '<a class="dp-discord-button" href="#" data-discord-cta="home_hero">Join our Discord</a>' +
      '<div data-discord-placement="sidebar_footer"></div>';
    mountDiscordPlacements(document);
    for (const link of document.querySelectorAll('a')) {
      link.addEventListener('click', (e) => e.preventDefault());
      await userEvent.click(link);
    }
    expect(events().map((c) => c[2])).toEqual([{ placement: 'home_hero' }, { placement: 'sidebar_footer' }]);
  });

  it('ignores unknown placements', async () => {
    document.body.innerHTML = '<a href="#" data-discord-cta="footer">x</a>';
    const link = document.querySelector('a')!;
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(events()).toEqual([]);
  });
});

describe('mountDiscordPlacements', () => {
  it('fills empty placeholders once, with the same markup as DiscordButton', () => {
    document.body.innerHTML =
      '<div data-discord-placement="docs_page_end"></div>' +
      '<div data-discord-placement="reference_request_panel"></div>' +
      '<div data-discord-placement="sidebar_footer"><a href="/x">kept</a></div>' +
      '<div data-discord-placement="nowhere"></div>';
    expect(mountDiscordPlacements(document)).toHaveLength(2);
    expect(mountDiscordPlacements(document)).toHaveLength(0);
    const end = document.querySelector('[data-discord-placement="docs_page_end"] a')!;
    const { container } = render(<DiscordButton placement="docs_page_end" />);
    expect(end.outerHTML).toBe(container.innerHTML);
    expect(document.querySelector('[data-discord-placement="reference_request_panel"]')!.textContent).toBe(
      'Questions about this endpoint?Join our Discord'
    );
    expect(document.querySelector('[data-discord-placement="nowhere"]')!.childElementCount).toBe(0);
  });

  it('makes a secondary link for the hero', () => {
    expect(createDiscordLink(document, 'home_hero', 'secondary').className).toBe(
      'dp-discord-button dp-discord-button--secondary'
    );
  });
});

describe('enhanceContactPageDiscord', () => {
  it('adds the Discord line after the Formstack frame, once', () => {
    document.body.innerHTML =
      '<div id="b"><p>Use this form</p><iframe src="https://sefaria.formstack.com/forms/developer_contact"></iframe></div>';
    const body = document.getElementById('b')!;
    const placement = enhanceContactPageDiscord(body)!;
    expect(placement.previousElementSibling?.tagName).toBe('IFRAME');
    expect(placement.querySelector('a')).toHaveAttribute('data-discord-cta', 'contact_page');
    expect(enhanceContactPageDiscord(body)).toBe(placement);
    expect(body.querySelectorAll('[data-discord-cta]')).toHaveLength(1);
  });

  it('does nothing without the Formstack frame', () => {
    document.body.innerHTML = '<div id="b"><iframe src="https://www.youtube-nocookie.com/embed/x"></iframe></div>';
    expect(enhanceContactPageDiscord(document.getElementById('b')!)).toBeNull();
  });
});
