// The endpoint page against the behavior checklists of PLAN §6.2 (B parameters, C responses, D code samples,
// E Try It) and the security checks S-1, S-3, S-13 (§6.7).
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { AnalyticsEvent } from '../analytics/events';
import { Endpoint } from './Endpoint';
import { LANGUAGE_KEY } from './state';
import { operation } from './test/specs';
import { RECENT_REQUESTS_KEY } from './tryit/recent';

// Full-page renders are slow on a shared CI runner.
vi.setConfig({ testTimeout: 30_000 });

const ORIGIN = 'https://www.sefaria.org';

function setup(operationId: string, fetchImpl?: typeof fetch, onAnalyticsEvent?: (e: AnalyticsEvent) => void) {
  const user = userEvent.setup();
  // userEvent.setup() installs its own clipboard; replace it with a spy.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
  const utils = render(
    <Endpoint
      op={operation(operationId)}
      apiOrigin={ORIGIN}
      fetchImpl={fetchImpl}
      onAnalyticsEvent={onAnalyticsEvent}
    />
  );
  return { user, ...utils };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('B. Parameters', () => {
  it('prefills a required input with its default and shows the first example as placeholder', () => {
    setup('get-v3-texts');
    const tref = screen.getByRole('combobox', { name: 'tref' });
    expect(tref).toHaveValue('Esther 1.1');
    expect(tref).toHaveAttribute('placeholder', 'Esther 1.1');
    const version = screen.getByRole('combobox', { name: 'version' });
    expect(version).toHaveValue('');
    expect(version).toHaveAttribute('placeholder', 'hebrew');
  });

  it('shows type, "required" and "Defaults to X" in the label row', () => {
    setup('get-v3-texts');
    const row = document.getElementById('path-params-tref')!;
    expect(within(row).getByText('string')).toBeInTheDocument();
    expect(within(row).getByText('required')).toBeInTheDocument();
    expect(within(row).getByText('Defaults to Esther 1.1')).toBeInTheDocument();
    const fmt = document.getElementById('query-params-return_format')!;
    expect(within(fmt).getByText('enum')).toBeInTheDocument();
    expect(within(fmt).getByText('Defaults to default')).toBeInTheDocument();
  });

  it('shows a select and "Allowed:" chips for an enum; a chip copies its value and leaves the select alone', async () => {
    const { user } = setup('get-calendars');
    const select = screen.getByRole('combobox', { name: 'custom' });
    expect(select.tagName).toBe('SELECT');
    await user.click(screen.getByRole('button', { name: 'sephardi' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sephardi');
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
    expect(select).toHaveValue('');
    // The literal %20 stays as authored.
    expect(screen.getByRole('button', { name: 'edot%20hamizrach' })).toBeInTheDocument();
  });

  it('opens "Use example value" entries on focus and fills the input from one', async () => {
    const { user } = setup('get-v3-texts');
    const version = screen.getByRole('combobox', { name: 'version' });
    await user.click(version);
    expect(version).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Use example valuehebrew',
      'Use example valuehebrew|Miqra according to the Masorah',
    ]);
    await user.click(items[1]!);
    expect(version).toHaveValue('hebrew|Miqra according to the Masorah');
  });

  it('expands an object body parameter with "+" to its fields', async () => {
    const { user } = setup('post-find-refs');
    const expander = screen.getByRole('button', { name: 'text object' });
    expect(expander).toHaveAttribute('aria-expanded', 'false');
    await user.click(expander);
    expect(screen.getByRole('combobox', { name: 'body' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'title' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'lang' }).tagName).toBe('SELECT');
  });

  it('Tab from an input with examples closes the list and goes on to the next field, as on live', async () => {
    const { user } = setup('post-find-refs');
    await user.click(screen.getByRole('button', { name: 'text object' }));
    const title = screen.getByRole('combobox', { name: 'title' });
    await user.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    // The entries are not Tab stops: live's next stops are the lang anchor, then its select.
    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip link to lang' })).toHaveFocus();
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu', { name: 'Examples for title' })).toBeNull();
    await user.tab();
    expect(screen.getByRole('combobox', { name: 'lang' })).toHaveFocus();
    // Shift+Tab back into the input reopens its list; the arrow keys reach the entries, Escape returns to the input.
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('aria-expanded', 'false');
  });

  it('has the section and parameter anchors', () => {
    setup('post-find-refs');
    expect(document.getElementById('body-params')).not.toBeNull();
    expect(document.getElementById('body-params-text')).not.toBeNull();
    expect(document.getElementById('response-schemas')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Skip link to Body Params' })).toHaveAttribute('href', '#body-params');
    expect(screen.getByRole('link', { name: 'Skip link to lang' })).toHaveAttribute('href', '#body-params-lang');
  });

  it('a {placeholder} chip focuses its input; typing replaces the chip and updates the sample', async () => {
    const { user } = setup('get-v3-texts');
    const chip = screen.getByText('{tref}');
    await user.click(chip);
    const tref = screen.getByRole('combobox', { name: 'tref' });
    expect(tref).toHaveFocus();
    await user.clear(tref);
    await user.type(tref, 'Genesis 1:1');
    expect(screen.getByTestId('serverurl')).toHaveTextContent('https://www.sefaria.org/api/v3/texts/Genesis 1:1');
    expect(screen.getByLabelText('Shell request sample')).toHaveTextContent('/api/v3/texts/Genesis%201%3A1');
  });
});

describe('C. Responses', () => {
  it('reads "Response" for one status and "Responses" for several, with h3 > button toggles and one h1', () => {
    const { unmount } = setup('get-v3-texts');
    expect(screen.getByRole('heading', { level: 2, name: 'Response' })).toBeInTheDocument();
    unmount();
    setup('post-find-refs');
    expect(screen.getByRole('heading', { level: 2, name: 'Responses' })).toBeInTheDocument();
    const toggles = screen.getAllByRole('heading', { level: 3 }).map((h) => within(h).getByRole('button'));
    expect(toggles.map((t) => t.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(toggles[0]).toHaveAccessibleName(/^200/);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('shows the response body with nested properties, union selects and the status dot', async () => {
    const { user } = setup('get-v3-texts');
    expect(screen.getByText('Response body')).toBeInTheDocument();
    expect(screen.getAllByText('array of objects').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('combobox', { name: 'priority type' })[0]).toHaveDisplayValue('string');
    const toggle = screen.getAllByRole('heading', { level: 3 })[0]!;
    expect(within(toggle).getByRole('img', { name: '200' })).toBeInTheDocument();
    await user.click(within(toggle).getByRole('button'));
    expect(screen.queryByText('Response body')).toBeNull();
  });

  it('opens top-level objects and arrays of objects, closes deeper objects, and documents scalar-item arrays', async () => {
    const { user } = setup('post-find-refs');
    const body = screen.getByRole('region', { name: /^200/ });
    // title and body (top-level objects) list their properties; results (array of objects) shows its item fields.
    expect(within(body).getAllByText('startChar')).toHaveLength(2);
    // refs: items are a documented string ($ref ref); live labels it "array of objects" and shows the item text.
    expect(within(body).getAllByText(/A string representing a citation to a Jewish text/)).toHaveLength(2);
    // refData (an object one level down) is closed until opened.
    expect(within(body).queryByText('RefTitle')).toBeNull();
    const [refData] = within(body).getAllByRole('button', { name: 'refData object' });
    await user.click(refData!);
    expect(within(body).getByText('RefTitle')).toBeInTheDocument();
  });

  it('shows anyOf unions as closed options, oneOf with an array as a select and expander, nullable as "| null"', async () => {
    const { user } = setup('get-v1-texts');
    const body = screen.getByRole('region', { name: /^200/ });
    expect(within(body).getByText('string | array')).toBeInTheDocument();
    for (const label of ['Array 1', 'Array 2', 'Array 3'])
      expect(within(body).getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false');
    await user.click(within(body).getByRole('button', { name: 'Array 1' }));
    expect(within(body).getByRole('button', { name: 'Array 1' })).toHaveAttribute('aria-expanded', 'true');
    const he = within(body).getByRole('combobox', { name: 'he type' });
    expect(
      within(he)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['array', 'string']);
    expect(within(body).getByRole('button', { name: 'he array of strings' })).toBeInTheDocument();
    expect(within(body).getAllByText('string | null').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the first example on load; the menu lists examples and "Clear Example", which shows the empty state', async () => {
    const { user } = setup('get-v3-texts');
    const card = screen.getByRole('region', { name: 'Response' });
    const button = within(card).getByRole('button', { name: /200 - Esther 1\.1/ });
    await user.click(button);
    expect(within(card).getByRole('menuitem', { name: /200 - Esther 1\.1/ })).toBeInTheDocument();
    await user.click(within(card).getByRole('menuitem', { name: 'Clear Example' }));
    expect(card).toHaveTextContent('Click Try It! to start a request and see the response here! Or choose an example:');
    await user.click(within(card).getByRole('button', { name: /200 - Esther 1\.1/ }));
    expect(within(card).getByLabelText('Response example')).toHaveTextContent('"versions"');
  });
});

describe('D. Code samples', () => {
  it('selects Shell on load and offers the five buttons and 18 more languages', async () => {
    const { user } = setup('get-v3-texts');
    const shell = screen.getByRole('button', { name: 'Shell' });
    expect(shell).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Node', 'Ruby', 'PHP', 'Python']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    await user.click(screen.getByRole('button', { name: 'More Languages' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(18);
    expect(screen.getAllByRole('menuitem')[0]).toHaveTextContent('Agent Prompt');
  });

  it('opens the library menu from the card header and remembers language and library per browser', async () => {
    const { user, unmount } = setup('get-v3-texts');
    await user.click(screen.getByRole('button', { name: 'Node' }));
    await user.click(screen.getByRole('button', { name: 'fetch Request' }));
    await user.click(screen.getByRole('menuitem', { name: 'Axios' }));
    expect(screen.getByLabelText('Node request sample')).toHaveTextContent("import axios from 'axios';");
    expect(JSON.parse(window.localStorage.getItem(LANGUAGE_KEY)!)).toEqual({
      language: 'node',
      libraries: { node: 'axios' },
    });
    expect(document.cookie).toBe('');
    unmount();
    setup('get-calendars');
    expect(screen.getByRole('button', { name: 'Node' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Axios Request' })).toBeInTheDocument();
  });

  it('copies the sample and shows "Copied!"', async () => {
    const { user } = setup('get-v3-texts');
    const card = screen.getByLabelText('Shell request sample').closest('[class*="requestCard"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Copy to clipboard' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('curl --request GET'));
    expect(await within(card).findByText('Copied!')).toBeInTheDocument();
  });

  it('offers an "Examples" menu of request bodies on POST pages', async () => {
    const { user } = setup('post-find-refs');
    await user.click(screen.getByRole('button', { name: 'Examples' }));
    await user.click(screen.getByRole('menuitem', { name: 'Example' }));
    expect(screen.getByLabelText('Shell request sample')).toHaveTextContent('Some thoughts on Sefer Bereishit 1');
  });
});

describe('E. Try It', () => {
  it('sends with the C10 options, shows the status, headers and body, logs the request and the event', async () => {
    let resolveFetch: (r: Response) => void = () => undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;
    const events: AnalyticsEvent[] = [];
    const { user } = setup('get-v3-texts', fetchImpl, (e) => events.push(e));
    await user.type(screen.getByRole('combobox', { name: 'version' }), 'secret-query-value');
    await user.click(screen.getByRole('button', { name: 'Try It!' }));
    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeInTheDocument();
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/api/v3/texts/Esther%201.1?version=secret-query-value`);
    expect(init).toMatchObject({ credentials: 'omit', mode: 'cors', cache: 'no-store', referrerPolicy: 'no-referrer' });
    await act(async () => resolveFetch(jsonResponse({ versions: [] }, 200, { 'x-test': 'yes' })));
    const card = screen.getByRole('region', { name: 'Response' });
    expect(within(card).getByRole('img', { name: '200' })).toBeInTheDocument();
    expect(within(card).getByLabelText('Response body')).toHaveTextContent('"versions": []');
    expect(screen.getByText('Response 200')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /^200/ }));
    expect(within(card).getByRole('menuitem', { name: 'Clear Response' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(within(card).getByRole('button', { name: 'Headers' }));
    const dialog = screen.getByRole('dialog', { name: 'Headers' });
    expect(dialog).toHaveTextContent('x-test');
    expect(dialog).toHaveTextContent('accept');
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[1]!);
    expect(screen.queryByRole('dialog', { name: 'Headers' })).toBeNull();
    expect(events).toEqual([
      { name: 'try_it_run', params: { operation_id: 'get-v3-texts', method: 'GET', status: 200 } },
    ]);
    // Recent Requests: a row at once; nothing typed is stored (S-13).
    expect(screen.getByRole('button', { name: 'Less than a minute ago' })).toBeInTheDocument();
    const stored = window.localStorage.getItem(RECENT_REQUESTS_KEY)!;
    expect(stored).toContain('/api/v3/texts/{tref}');
    expect(stored).not.toContain('secret-query-value');
    expect(stored).not.toContain('versions');
  });

  it('fires even when a required field is empty, and shows a 404 with a red dot', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'Could not find title in reference: Notabook 99' }, 404));
    const { user } = setup('get-v3-texts', fetchImpl as unknown as typeof fetch);
    await user.clear(screen.getByRole('combobox', { name: 'tref' }));
    await user.click(screen.getByRole('button', { name: 'Try It!' }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    const card = screen.getByRole('region', { name: 'Response' });
    expect(await within(card).findByRole('img', { name: '404' })).toHaveClass('status4');
  });

  it('shows a hostile response as text: no element from the body is created (S-3)', async () => {
    const hostile = '<script>window.__pwned = 1</script><img src=x onerror="window.__pwned = 2">';
    const fetchImpl = vi.fn(
      async () => new Response(hostile, { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const { user } = setup('get-calendars', fetchImpl as unknown as typeof fetch);
    await user.click(screen.getByRole('button', { name: 'Try It!' }));
    const body = await screen.findByLabelText('Response body');
    expect(body.textContent).toContain(hostile);
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('a JSON body with markup stays text too', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: '<img src=x onerror=alert(1)>' }));
    const { user } = setup('get-calendars', fetchImpl as unknown as typeof fetch);
    await user.click(screen.getByRole('button', { name: 'Try It!' }));
    expect(await screen.findByLabelText('Response body')).toHaveTextContent('"<img src=x onerror=alert(1)>"');
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('F. Page chrome', () => {
  it('the tag button opens a popover naming the operation tag', async () => {
    const { user } = setup('get-v3-texts');
    await user.click(screen.getByRole('button', { name: 'View tags' }));
    expect(screen.getByRole('dialog', { name: 'Tags' })).toHaveTextContent('Text');
  });

  it('marks a deprecated operation', () => {
    setup('get-v1-texts');
    expect(screen.getByText('deprecated')).toBeInTheDocument();
  });

  it('renders the request-panel Discord placeholder (D-3)', () => {
    setup('get-v3-texts');
    expect(screen.getByText('Questions about this endpoint?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join our Discord' })).toHaveAttribute(
      'data-discord-placement',
      'reference_request_panel'
    );
  });
});

describe('accessibility', () => {
  it.each(['get-v3-texts', 'post-find-refs', 'get-calendars'])(
    '%s has no axe violations',
    async (operationId) => {
      const { container } = setup(operationId);
      expect(await axe(container)).toHaveNoViolations();
    },
    180_000
  );
});
