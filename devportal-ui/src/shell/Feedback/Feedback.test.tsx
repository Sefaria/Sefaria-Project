import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { axe } from 'vitest-axe';
import { COMMENT_MAX_LENGTH, CSRF_URL, FEEDBACK_URL, feedbackBody, resetCsrfTokenForTests } from './api';
import { Feedback } from './Feedback';

const PATH = '/reference/get-v3-texts';
const SCHEMAS = resolve(import.meta.dirname, '../../../../devportal/contracts/schemas');
const schema = (name: string) => JSON.parse(readFileSync(resolve(SCHEMAS, `${name}.schema.json`), 'utf8')) as object;
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(schema('common'));
/** Contract C3 `feedback-request`. */
const validRequest = ajv.compile(schema('feedback-request'));

interface Call {
  url: string;
  init?: RequestInit;
}

function server(responses: { feedback?: number[]; csrf?: string[] } = {}) {
  const calls: Call[] = [];
  const feedback = [...(responses.feedback ?? [201])];
  const tokens = [...(responses.csrf ?? ['tok-1'])];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === CSRF_URL) return Response.json({ csrfToken: tokens.shift() ?? 'tok-x' });
    if (url === FEEDBACK_URL) {
      const status = feedback.shift() ?? 201;
      return status === 201 ? Response.json({ ok: true }, { status }) : Response.json({ error: 'x' }, { status });
    }
    return new Response('missing', { status: 404 });
  });
  return { calls, fetchMock: fetchMock as unknown as typeof fetch };
}

const posts = (calls: Call[]) => calls.filter((c) => c.url === FEEDBACK_URL);
const csrfCalls = (calls: Call[]) => calls.filter((c) => c.url === CSRF_URL);

beforeEach(() => resetCsrfTokenForTests());

describe('Feedback', () => {
  it('asks "Did this page help you?" with Yes and No, and no popover yet', () => {
    render(<Feedback path={PATH} fetchImpl={server().fetchMock} />);
    expect(screen.getByText('Did this page help you?')).toBeInTheDocument();
    const yes = screen.getByRole('button', { name: 'Yes, this page helped me' });
    const no = screen.getByRole('button', { name: 'No, this page did not help me' });
    expect(yes).toHaveTextContent('Yes');
    expect(no).toHaveTextContent('No');
    expect(yes).toHaveAttribute('aria-haspopup', 'dialog');
    expect(yes).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fetches the CSRF token on first use, then POSTs the C3 request with it and thanks the reader', async () => {
    const user = userEvent.setup();
    const { calls, fetchMock } = server();
    render(<Feedback path={PATH} fetchImpl={fetchMock} />);
    expect(calls).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Yes, this page helped me' }));
    await waitFor(() => expect(csrfCalls(calls)).toHaveLength(1));
    expect(csrfCalls(calls)[0]!.init).toMatchObject({ credentials: 'same-origin' });

    const dialog = screen.getByRole('dialog', { name: 'Did this page help you?' });
    const comment = screen.getByRole('textbox', { name: 'Leave an optional comment…' });
    expect(dialog).toContainElement(comment);
    expect(comment).toHaveFocus();
    await user.type(comment, 'Clear and useful');
    await user.click(screen.getByRole('button', { name: 'Vote' }));

    expect(await screen.findByText('Thanks for voting!')).toBeInTheDocument();
    const [post] = posts(calls);
    expect(post!.init!.method).toBe('POST');
    expect(post!.init!.credentials).toBe('same-origin');
    expect(new Headers(post!.init!.headers).get('X-CSRFToken')).toBe('tok-1');
    expect(new Headers(post!.init!.headers).get('Content-Type')).toBe('application/json');
    const body = JSON.parse(String(post!.init!.body));
    expect(body).toEqual({ path: PATH, helpful: true, comment: 'Clear and useful' });
    expect(validRequest(body)).toBe(true);
    // Still one token request.
    expect(csrfCalls(calls)).toHaveLength(1);
  });

  it('sends helpful: false and an empty comment for "No" without a comment', async () => {
    const user = userEvent.setup();
    const { calls, fetchMock } = server();
    render(<Feedback path={PATH} fetchImpl={fetchMock} />);
    await user.click(screen.getByRole('button', { name: 'No, this page did not help me' }));
    await user.click(screen.getByRole('button', { name: 'Vote' }));
    await screen.findByText('Thanks for voting!');
    expect(JSON.parse(String(posts(calls)[0]!.init!.body))).toEqual({ path: PATH, helpful: false, comment: '' });
  });

  it('reuses the token across widgets on the page', async () => {
    const user = userEvent.setup();
    const { calls, fetchMock } = server({ feedback: [201, 201] });
    render(
      <>
        <Feedback path={PATH} fetchImpl={fetchMock} />
        <Feedback path="/docs/welcome" fetchImpl={fetchMock} />
      </>
    );
    const [yesA, yesB] = screen.getAllByRole('button', { name: 'Yes, this page helped me' });
    await user.click(yesA!);
    await user.click(screen.getByRole('button', { name: 'Vote' }));
    await screen.findByText('Thanks for voting!');
    await user.click(yesB!);
    await user.click(screen.getByRole('button', { name: 'Vote' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    expect(csrfCalls(calls)).toHaveLength(1);
  });

  it('keeps the comment to 2000 characters (C3 maxLength)', async () => {
    const user = userEvent.setup();
    const { calls, fetchMock } = server();
    render(<Feedback path={PATH} fetchImpl={fetchMock} />);
    await user.click(screen.getByRole('button', { name: 'Yes, this page helped me' }));
    const comment = screen.getByRole('textbox', { name: 'Leave an optional comment…' });
    expect(comment).toHaveAttribute('maxLength', String(COMMENT_MAX_LENGTH));
    fireEvent.change(comment, { target: { value: 'x'.repeat(2100) } });
    expect(comment).toHaveValue('x'.repeat(2000));
    await user.click(screen.getByRole('button', { name: 'Vote' }));
    await screen.findByText('Thanks for voting!');
    expect(JSON.parse(String(posts(calls)[0]!.init!.body)).comment).toHaveLength(2000);
    expect(feedbackBody(PATH, true, 'y'.repeat(2500)).comment).toHaveLength(2000);
  });

  it('retries once with a fresh token after a 403', async () => {
    const user = userEvent.setup();
    const { calls, fetchMock } = server({ feedback: [403, 201], csrf: ['old', 'new'] });
    render(<Feedback path={PATH} fetchImpl={fetchMock} />);
    await user.click(screen.getByRole('button', { name: 'Yes, this page helped me' }));
    await user.click(screen.getByRole('button', { name: 'Vote' }));
    await screen.findByText('Thanks for voting!');
    expect(posts(calls).map((c) => new Headers(c.init!.headers).get('X-CSRFToken'))).toEqual(['old', 'new']);
  });

  it('shows an error and keeps the comment on 429 or a failed request', async () => {
    const user = userEvent.setup();
    const { fetchMock } = server({ feedback: [429, 500] });
    render(<Feedback path={PATH} fetchImpl={fetchMock} />);
    await user.click(screen.getByRole('button', { name: 'Yes, this page helped me' }));
    await user.type(screen.getByRole('textbox'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Vote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many votes');
    await user.click(screen.getByRole('button', { name: 'Vote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be sent');
    expect(screen.getByRole('textbox')).toHaveValue('hello');
  });

  it('closes the popover on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<Feedback path={PATH} fetchImpl={server().fetchMock} />);
    const no = screen.getByRole('button', { name: 'No, this page did not help me' });
    await user.click(no);
    expect(no).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(no).toHaveFocus();
  });

  it('has no axe violations, closed and open', async () => {
    const user = userEvent.setup();
    const { container } = render(<Feedback path={PATH} fetchImpl={server().fetchMock} />);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Yes, this page helped me' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
