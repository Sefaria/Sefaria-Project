import './test/dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { EditorConflictResponse, EditorPage, EditorTree, RevisionSummary } from '../contracts';
import { ApiError, ConflictError, EditorApi } from './api';
import { EditorApp, type EditorBoot } from './EditorApp';

const BODY =
  '# Welcome\n\n<Callout icon="📘" theme="info">\nHello **there**.\n</Callout>\n\n| a | b |\n| - | - |\n| 1 | 2 |\n';

function summary(number: number, extra: Partial<RevisionSummary> = {}): RevisionSummary {
  return {
    number,
    source: 'editor',
    author: { id: 1, name: 'Staff' },
    createdAt: '2026-11-18T10:00:00Z',
    title: 'Welcome',
    isPublished: false,
    isDraft: false,
    ...extra,
  };
}

const TREE: EditorTree = {
  contractVersion: 1,
  section: 'docs',
  generation: 3,
  nodes: [
    {
      id: 1,
      kind: 'category',
      title: 'TECHNICAL DOCS',
      slug: null,
      hidden: false,
      deprecated: false,
      hasDraft: false,
      isPublished: true,
      method: null,
      operationId: null,
      children: [
        {
          id: 2,
          kind: 'page',
          title: 'Welcome',
          slug: 'welcome',
          hidden: false,
          deprecated: false,
          hasDraft: false,
          isPublished: true,
          method: null,
          operationId: null,
          children: [],
        },
      ],
    },
  ],
};

const PAGE: EditorPage = {
  contractVersion: 1,
  page: {
    id: 2,
    section: 'docs',
    kind: 'page',
    slug: 'welcome',
    parentId: 1,
    position: 0,
    operationId: null,
    path: '/docs/welcome',
    publishedRevision: 1,
    draftRevision: null,
    contentUpdatedAt: null,
  },
  revision: summary(1, { isPublished: true, source: 'import', author: null }),
  content: {
    title: 'Welcome',
    excerpt: 'Start here',
    bodyMd: BODY,
    hidden: false,
    deprecated: false,
    metadata: { title: '', description: '', robots: 'index' },
    next: { description: '', pages: [] },
    linkUrl: null,
    linkNewTab: false,
    fullscreen: false,
    apiConfig: null,
    endpoint: null,
  },
  spec: null,
};

const BOOT: EditorBoot = {
  contractVersion: 1,
  apiBase: '/_portal/editor',
  csrfUrl: '/_portal/csrf',
  user: { id: 1, name: 'Staff' },
  initial: { section: 'docs', slug: 'welcome' },
};

function fakeApi() {
  const api = new EditorApi({ fetch: vi.fn() });
  const spies = {
    tree: vi.spyOn(api, 'tree').mockResolvedValue(TREE),
    page: vi.spyOn(api, 'page').mockResolvedValue(PAGE),
    saveDraft: vi.spyOn(api, 'saveDraft').mockResolvedValue({
      contractVersion: 1,
      page: { ...PAGE.page, draftRevision: 2 },
      revision: summary(2, { isDraft: true }),
    }),
    publish: vi.spyOn(api, 'publish').mockResolvedValue({
      contractVersion: 1,
      page: { ...PAGE.page, publishedRevision: 2 },
      revision: summary(2, { isPublished: true }),
      generation: 4,
      url: 'http://developers.localhost/docs/welcome',
    }),
    revisions: vi
      .spyOn(api, 'revisions')
      .mockResolvedValue({ contractVersion: 1, pageId: 2, revisions: [summary(1, { isPublished: true })] }),
    restore: vi.spyOn(api, 'restore').mockResolvedValue({
      contractVersion: 1,
      page: PAGE.page,
      revision: summary(2, { isDraft: true, source: 'restore' }),
    }),
    preview: vi.spyOn(api, 'preview').mockResolvedValue({
      contractVersion: 1,
      title: 'Welcome',
      excerpt: 'Start here',
      bodyHtml:
        '<h1 class="dp-heading dp-heading-1" id="welcome" dir="auto"><span class="dp-heading-text">Welcome</span></h1>',
      toc: [],
      sanitizerRemovals: [],
    }),
  };
  return { api, spies };
}

async function open() {
  const { api, spies } = fakeApi();
  const view = render(<EditorApp boot={BOOT} api={api} />);
  await screen.findByDisplayValue('Welcome');
  await waitFor(() => expect(view.container.querySelector('.ProseMirror')).not.toBeNull());
  return { view, api, spies };
}

describe('EditorApp', () => {
  it('opens the page named in the address, with its tree, canvas and settings', async () => {
    const { spies } = await open();
    expect(spies.tree).toHaveBeenCalledWith('docs');
    expect(spies.page).toHaveBeenCalledWith(2);
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Body of Welcome' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page settings' })).toBeInTheDocument();
  });

  it('saves a draft without edits as the same Markdown, with the base revision', async () => {
    const { spies } = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(spies.saveDraft).toHaveBeenCalledWith(2, { baseRevision: 1, content: { ...PAGE.content, bodyMd: BODY } });
    expect(await screen.findByText(/Draft saved as revision 2/)).toBeInTheDocument();
  });

  it('saves settings with the draft', async () => {
    const { spies } = await open();
    await userEvent.click(screen.getByLabelText('Hidden (not in the sidebar, search or llms.txt)'));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(spies.saveDraft.mock.calls[0]?.[1].content.hidden).toBe(true);
  });

  it('shows a conflict and can save on top of the newer revision', async () => {
    const { spies } = await open();
    const conflict: EditorConflictResponse = {
      error: { code: 'revision_conflict', message: 'Someone saved this page after you opened it.' },
      latest: summary(5, { author: { id: 9, name: 'Other' } }),
      generation: 3,
    };
    spies.saveDraft.mockRejectedValueOnce(new ConflictError(conflict));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Revision 5 was saved by Other');
    await userEvent.click(within(alert).getByRole('button', { name: 'Save mine on top of theirs' }));
    expect(spies.saveDraft).toHaveBeenLastCalledWith(2, expect.objectContaining({ baseRevision: 5 }));
  });

  it('publishes: saves the changes as a draft first, then publishes it', async () => {
    const { spies } = await open();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(spies.publish).toHaveBeenCalledWith(2, 2));
    expect(spies.saveDraft).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Published revision 2/)).toBeInTheDocument();
  });

  it('View shows the server rendering of the draft', async () => {
    const { spies } = await open();
    await userEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(spies.preview).toHaveBeenCalledWith(expect.objectContaining({ pageId: 2, section: 'docs', kind: 'page' }));
    const article = await screen.findByRole('article', { name: 'Preview of the draft' });
    expect(within(article).getAllByRole('heading', { level: 1, name: 'Welcome' })).toHaveLength(2);
    expect(article.querySelector('.dp-markdown #welcome')).not.toBeNull();
  });

  it('lists revisions and restores one as a new draft', async () => {
    const { spies } = await open();
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore revision 1 as a new draft' }));
    expect(spies.restore).toHaveBeenCalledWith(2, 1, 1);
  });

  it('has no axe violations', async () => {
    const { view } = await open();
    await act(async () => {});
    expect(await axe(view.container, { iframes: false })).toHaveNoViolations();
  });
});

describe('EditorApi', () => {
  function respond(status: number, body: unknown) {
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    );
  }

  it('sends the CSRF token on unsafe requests only, same-origin', async () => {
    const fetchFn = vi.fn((url: string) =>
      url === '/_portal/csrf' ? respond(200, { csrfToken: 'tok' }) : respond(200, {})
    );
    const api = new EditorApi({ fetch: fetchFn as unknown as typeof fetch });
    await api.tree('docs');
    await api.publish(2, 3);
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const tree = calls.find(([url]) => url === '/_portal/editor/tree/docs')!;
    expect(tree[1].headers).not.toHaveProperty('X-CSRFToken');
    const publish = calls.find(([url]) => url === '/_portal/editor/pages/2/publish')!;
    expect(publish[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', body: '{"revision":3}' });
    expect(publish[1].headers).toMatchObject({ 'X-CSRFToken': 'tok', 'Content-Type': 'application/json' });
  });

  it('turns a 409 into a ConflictError and other errors into ApiError', async () => {
    const conflict = { error: { code: 'tree_conflict', message: 'Changed.' }, latest: null, generation: 9 };
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => respond(200, { csrfToken: 'tok' }))
      .mockImplementationOnce(() => respond(409, conflict))
      .mockImplementationOnce(() => respond(403, { error: { code: 'forbidden', message: 'Only staff.' } }));
    const api = new EditorApi({ fetch: fetchFn as unknown as typeof fetch });
    await expect(api.move(1, { parentId: null, position: 0, baseGeneration: 1 })).rejects.toMatchObject({
      name: 'ConflictError',
      conflict,
    });
    const error = await api.tree('docs').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden', message: 'Only staff.' });
  });
});
