import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { EditorPage, RevisionContent } from '../../contracts';
import { EndpointPanel } from './EndpointPanel';
import { RevisionHistory } from './RevisionHistory';
import { SettingsPanel } from './SettingsPanel';

const CONTENT: RevisionContent = {
  title: 'Texts (v3)',
  excerpt: '',
  bodyMd: '',
  hidden: false,
  deprecated: false,
  metadata: { title: '', description: '', robots: 'index' },
  next: { description: '', pages: [] },
  linkUrl: null,
  linkNewTab: false,
  fullscreen: false,
  apiConfig: null,
  endpoint: { sidebarLabel: null, titleOverride: null, descriptionOverrideMd: null },
};

const ENDPOINT: EditorPage = {
  contractVersion: 1,
  page: {
    id: 9,
    section: 'reference',
    kind: 'endpoint',
    slug: 'get-v3-texts',
    parentId: 8,
    position: 0,
    operationId: 'get-v3-texts',
    path: '/reference/get-v3-texts',
    publishedRevision: 1,
    draftRevision: null,
    contentUpdatedAt: null,
  },
  revision: null,
  content: CONTENT,
  spec: {
    method: 'get',
    path: '/api/v3/texts/{tref}',
    title: 'Texts (v3)',
    description: 'Retrieve texts.',
    tags: ['Text'],
    deprecated: false,
  },
};

describe('EndpointPanel', () => {
  it('shows the spec read-only and edits only the overlay', async () => {
    const onChange = vi.fn();
    const view = render(<EndpointPanel page={ENDPOINT} content={CONTENT} onChange={onChange} />);
    expect(screen.getByText('GET /api/v3/texts/{tref}')).toBeInTheDocument();
    expect(screen.getByText('Retrieve texts.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sidebar label'), { target: { value: 'Texts' } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...CONTENT,
      endpoint: { sidebarLabel: 'Texts', titleOverride: null, descriptionOverrideMd: null },
    });
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: '**New**' } });
    expect(onChange.mock.lastCall?.[0].endpoint.descriptionOverrideMd).toBe('**New**');
    expect(onChange.mock.lastCall?.[0].title).toBe('Texts (v3)');
    expect(await axe(view.container)).toHaveNoViolations();
  });
});

describe('SettingsPanel', () => {
  const DOC: EditorPage = {
    ...ENDPOINT,
    page: {
      ...ENDPOINT.page,
      kind: 'page',
      section: 'docs',
      slug: 'welcome',
      operationId: null,
      path: '/docs/welcome',
    },
    content: { ...CONTENT, endpoint: null },
    spec: null,
  };

  it('changes the slug at once and the rest with the draft', async () => {
    const onSlug = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    const view = render(<SettingsPanel page={DOC} content={DOC.content} onChange={onChange} onSlug={onSlug} />);
    const slug = screen.getByLabelText('Slug');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'start-here');
    await userEvent.click(screen.getByRole('button', { name: 'Change slug' }));
    expect(onSlug).toHaveBeenCalledWith('start-here');
    expect(await screen.findByText(/old address now redirects/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Hide from search engines (noindex)'));
    expect(onChange.mock.lastCall?.[0].metadata.robots).toBe('noindex');
    await userEvent.click(screen.getByRole('button', { name: 'Add a next page' }));
    expect(onChange.mock.lastCall?.[0].next.pages).toEqual([{ type: 'basic', slug: '', title: '' }]);
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('shows link settings for a link', () => {
    const link = { ...DOC, page: { ...DOC.page, kind: 'link' as const } };
    render(<SettingsPanel page={link} content={link.content} onChange={vi.fn()} onSlug={vi.fn()} />);
    expect(screen.getByLabelText('Link URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Open in a new tab')).toBeInTheDocument();
  });
});

describe('RevisionHistory', () => {
  it('restores any revision but the current draft', async () => {
    const onRestore = vi.fn();
    render(
      <RevisionHistory
        busy={false}
        onRestore={onRestore}
        revisions={[
          {
            number: 2,
            source: 'editor',
            author: { id: 1, name: 'Staff' },
            createdAt: '2026-11-18T10:00:00Z',
            title: 'B',
            isPublished: false,
            isDraft: true,
          },
          {
            number: 1,
            source: 'import',
            author: null,
            createdAt: '2026-11-17T10:00:00Z',
            title: 'A',
            isPublished: true,
            isDraft: false,
          },
        ]}
      />
    );
    expect(screen.queryByRole('button', { name: /Restore revision 2/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Restore revision 1 as a new draft' }));
    expect(onRestore).toHaveBeenCalledWith(1);
  });
});
