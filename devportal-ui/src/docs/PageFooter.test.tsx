import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { DISCORD_PLACEMENT, PAGINATION_LABEL, PageFooter } from './PageFooter';
import { relativeTime, updatedText } from './relativeTime';

const NOW = new Date('2026-11-18T12:00:00Z');
const PAGER = {
  prev: { title: 'Embed Linker v2 In Your Site', path: '/docs/linker-v2' },
  next: { title: 'How to Format Citations for the Linker', path: '/docs/how-to-format-citations-for-the-linker' },
};

describe('relativeTime (dayjs fromNow wording, as live)', () => {
  const ago = (ms: number) => relativeTime(new Date(NOW.getTime() - ms), NOW);
  const DAY = 86_400_000;
  it.each([
    [10_000, 'a few seconds ago'],
    [60_000, 'a minute ago'],
    [10 * 60_000, '10 minutes ago'],
    [3_600_000, 'an hour ago'],
    [5 * 3_600_000, '5 hours ago'],
    [DAY, 'a day ago'],
    [6 * DAY, '6 days ago'],
    [30 * DAY, 'a month ago'],
    [158 * DAY, '5 months ago'],
    [400 * DAY, 'a year ago'],
    [3 * 365 * DAY, '3 years ago'],
  ])('%i ms → %s', (ms, text) => {
    expect(ago(ms)).toBe(text);
  });

  it('formats the footer line and rejects bad dates', () => {
    expect(updatedText('2026-06-12T11:00:00Z', NOW)).toBe('Updated 5 months ago');
    expect(updatedText('not a date', NOW)).toBeNull();
  });
});

describe('PageFooter', () => {
  it('shows Updated, the pagination, then the feedback slot and the Discord slot after it', async () => {
    const { container } = render(
      <PageFooter
        updatedAt="2026-06-12T11:00:00Z"
        pager={PAGER}
        now={NOW}
        feedback={<p>Did this page help you?</p>}
        discord={<a href="https://discord.example">Join our Discord</a>}
      />
    );
    expect(screen.getByText(/^Updated/)).toHaveTextContent('Updated 5 months ago');
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-06-12T11:00:00Z');
    const nav = screen.getByRole('navigation', { name: PAGINATION_LABEL });
    expect(screen.getByRole('link', { name: `Previous Page: ${PAGER.prev.title}` })).toHaveAttribute(
      'href',
      '/docs/linker-v2'
    );
    expect(screen.getByRole('link', { name: `Next Page: ${PAGER.next.title}` })).toHaveTextContent(PAGER.next.title);
    const feedback = container.querySelector('[data-slot="feedback"]')!;
    const discord = container.querySelector(`[data-discord-placement="${DISCORD_PLACEMENT}"]`)!;
    expect(feedback).toHaveTextContent('Did this page help you?');
    // D-7: the Discord button comes right after the feedback widget.
    expect(feedback.nextElementSibling).toBe(discord);
    expect(nav.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('omits the pagination when the page has none, and Updated when there is no date', () => {
    const { container } = render(<PageFooter updatedAt={null} pager={{ prev: null, next: null }} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(container.querySelector('.dp-updated')).toBeNull();
    expect(container.querySelector('[data-discord-placement="docs_page_end"]')).toBeInTheDocument();
  });

  it('shows one side only when the page is first or last', () => {
    render(<PageFooter updatedAt={null} pager={{ prev: PAGER.prev, next: null }} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAccessibleName(/^Previous Page:/);
  });
});
