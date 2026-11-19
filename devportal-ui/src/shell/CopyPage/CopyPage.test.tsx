import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ANALYTICS_EVENT } from '../../analytics';
import live from './__fixtures__/live-copy-page.json';
import { chatGptUrl, claudeUrl, cursorDeepLink, mcpCommand, mcpConfig, vscodeDeepLink } from './actions';
import { CopyPage, type CopyPageEnv } from './CopyPage';

const MD = live.pages['/reference/get-v3-texts'].markdownUrl;
const MCP = live.mcpUrl;
const MARKDOWN = '---\ntitle: Texts (v3)\n---\n\n# Texts (v3)\n';

function setup(env: Partial<CopyPageEnv> = {}) {
  const events: unknown[] = [];
  const onEvent = (e: Event) => events.push((e as CustomEvent).detail);
  window.addEventListener(ANALYTICS_EVENT, onEvent);
  const fetchMock = vi.fn(async () => new Response(MARKDOWN, { status: 200 }));
  const open = vi.fn();
  const followDeepLink = vi.fn();
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const utils = render(
    <CopyPage
      markdownUrl={MD}
      mcpUrl={MCP}
      env={{ fetch: fetchMock as unknown as typeof fetch, open, followDeepLink, ...env }}
    />
  );
  const cleanup = () => window.removeEventListener(ANALYTICS_EVENT, onEvent);
  return { ...utils, events, fetchMock, open, followDeepLink, writeText, cleanup };
}

function actionsOf(events: unknown[]) {
  return events
    .filter((e) => (e as { name: string }).name === 'copy_page_action')
    .map((e) => (e as { params: { action: string } }).params.action);
}

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('Copy Page strings equal live', () => {
  it.each(Object.entries(live.pages))('prompt URLs for %s', (_path, page) => {
    expect(chatGptUrl(page.markdownUrl)).toBe(page.open_chatgpt);
    expect(claudeUrl(page.markdownUrl)).toBe(page.open_claude);
  });

  it('MCP config, command and the Cursor and VS Code deep links for <origin>/mcp', () => {
    expect(mcpConfig(MCP)).toBe(live.copy_mcp_config);
    expect(mcpCommand(MCP)).toBe(live.copy_mcp_command);
    expect(cursorDeepLink(MCP)).toBe(live.connect_cursor);
    expect(vscodeDeepLink(MCP)).toBe(live.connect_vscode);
  });
});

describe('CopyPage', () => {
  it('"Copy Page" fetches the page Markdown, copies it, shows "Copied" and sends copy_markdown', async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(screen.getByRole('button', { name: 'Copy Page' }));
    await waitFor(() => expect(t.writeText).toHaveBeenCalledWith(MARKDOWN));
    expect(t.fetchMock).toHaveBeenCalledWith(MD, expect.objectContaining({ credentials: 'same-origin' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(actionsOf(t.events)).toEqual(['copy_markdown']);
    t.cleanup();
  });

  it('falls back to execCommand("copy") without the Clipboard API', async () => {
    const user = userEvent.setup();
    const t = setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    await user.click(screen.getByRole('button', { name: 'Copy Page' }));
    await waitFor(() => expect(exec).toHaveBeenCalledWith('copy'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    // The helper textarea is gone again.
    expect(document.querySelector('textarea')).toBeNull();
    t.cleanup();
  });

  it('falls back when the Clipboard API rejects (permission denied)', async () => {
    const user = userEvent.setup();
    const t = setup();
    t.writeText.mockRejectedValueOnce(new Error('denied'));
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    await user.click(screen.getByRole('button', { name: 'Copy Page' }));
    await waitFor(() => expect(exec).toHaveBeenCalledWith('copy'));
    t.cleanup();
  });

  it('says so when there is no Markdown or nothing could be copied', async () => {
    const user = userEvent.setup();
    const t = setup({ fetch: (async () => new Response('', { status: 404 })) as unknown as typeof fetch });
    await user.click(screen.getByRole('button', { name: 'Copy Page' }));
    expect(await screen.findByText('No markdown content available to copy.')).toBeInTheDocument();
    expect(t.writeText).not.toHaveBeenCalled();
    t.cleanup();

    const u = setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = vi.fn(() => false);
    await user.click(screen.getAllByRole('button', { name: 'Copy Page' })[1]!);
    expect(await screen.findByText('Failed to copy to clipboard.')).toBeInTheDocument();
    u.cleanup();
  });

  it('opens a menu of seven items with an "MCP" group, in live order, without coloured dots (D-5)', async () => {
    const user = userEvent.setup();
    const t = setup();
    const toggle = screen.getByRole('button', { name: 'Copy Page options' });
    expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Copy Page options' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent)
    ).toEqual([
      'Open in ChatGPT',
      'Open in Claude',
      'Connect to Cursor',
      'Connect to VS Code',
      'Copy MCP Config',
      'Copy MCP Command',
      'View as Markdown',
    ]);
    const group = within(menu).getByRole('group', { name: 'MCP' });
    expect(within(group).getAllByRole('menuitem')).toHaveLength(4);
    expect(menu.querySelector('[class*="dot"]')).toBeNull();
    t.cleanup();
  });

  it('is keyboard operable: ArrowDown opens on the first item, arrows move, Escape closes and returns focus', async () => {
    const user = userEvent.setup();
    const t = setup();
    const toggle = screen.getByRole('button', { name: 'Copy Page options' });
    toggle.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Open in ChatGPT'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveTextContent('Open in Claude');
    await user.keyboard('{End}');
    expect(document.activeElement).toHaveTextContent('View as Markdown');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveTextContent('Open in ChatGPT');
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveTextContent('View as Markdown');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    t.cleanup();
  });

  it('moves focus into the menu when Enter opens it, and leaves it on the button for a pointer click', async () => {
    const user = userEvent.setup();
    const t = setup();
    const toggle = screen.getByRole('button', { name: 'Copy Page options' });
    toggle.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Open in ChatGPT'));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(toggle);
    await user.click(toggle);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(document.activeElement).toBe(toggle);
    t.cleanup();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    t.cleanup();
  });

  it('"Open in ChatGPT" and "Open in Claude" are links to live prompt URLs in a new tab, and report', async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
    const chatgpt = screen.getByRole('menuitem', { name: 'Open in ChatGPT' });
    const claude = screen.getByRole('menuitem', { name: 'Open in Claude' });
    expect(chatgpt).toHaveAttribute('href', live.pages['/reference/get-v3-texts'].open_chatgpt);
    expect(claude).toHaveAttribute('href', live.pages['/reference/get-v3-texts'].open_claude);
    for (const a of [chatgpt, claude]) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
    // jsdom does not navigate; the click handler reports the action.
    chatgpt.addEventListener('click', (e) => e.preventDefault());
    await user.click(chatgpt);
    await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
    const claude2 = screen.getByRole('menuitem', { name: 'Open in Claude' });
    claude2.addEventListener('click', (e) => e.preventDefault());
    await user.click(claude2);
    expect(actionsOf(t.events)).toEqual(['open_chatgpt', 'open_claude']);
    t.cleanup();
  });

  it('"View as Markdown" opens the .md URL in a new tab', async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
    await user.click(screen.getByRole('menuitem', { name: 'View as Markdown' }));
    expect(t.open).toHaveBeenCalledWith(MD, '_blank');
    expect(actionsOf(t.events)).toEqual(['view_markdown']);
    expect(screen.queryByRole('menu')).toBeNull();
    t.cleanup();
  });

  it.each([
    ['Copy MCP Config', 'copy_mcp_config', live.copy_mcp_config],
    ['Copy MCP Command', 'copy_mcp_command', live.copy_mcp_command],
  ])('"%s" copies live string and says "Copied to clipboard!"', async (label, action, text) => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
    await user.click(screen.getByRole('menuitem', { name: label }));
    await waitFor(() => expect(t.writeText).toHaveBeenCalledWith(text));
    expect(await screen.findByText('Copied to clipboard!')).toBeInTheDocument();
    expect(actionsOf(t.events)).toEqual([action]);
    t.cleanup();
  });

  it.each([
    ['Connect to Cursor', 'connect_cursor', live.connect_cursor, 'Cursor'],
    ['Connect to VS Code', 'connect_vscode', live.connect_vscode, 'VS Code'],
  ])(
    '"%s" follows live deep link and, if the app does not take it, offers the download',
    async (label, action, link, app) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const t = setup();
      await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
      await user.click(screen.getByRole('menuitem', { name: label }));
      expect(t.followDeepLink).toHaveBeenCalledWith(link);
      expect(actionsOf(t.events)).toEqual([action]);
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(screen.getByText(`${app} does not appear to be installed.`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: `Download ${app}` })).toHaveAttribute('target', '_blank');
      t.cleanup();
    }
  );

  it('says nothing when the app took the deep link (the page lost focus)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const t = setup();
    await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Connect to Cursor' }));
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByText('Cursor does not appear to be installed.')).toBeNull();
    t.cleanup();
  });

  it('has no axe violations, closed and open', async () => {
    const user = userEvent.setup();
    const t = setup();
    expect(await axe(t.container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Copy Page options' }));
    expect(await axe(t.container)).toHaveNoViolations();
    t.cleanup();
  });
});
