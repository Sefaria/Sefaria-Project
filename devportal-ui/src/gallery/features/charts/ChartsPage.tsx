import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { EXPERIENCE_LABELS, EXPERIENCE_LEVELS } from '../../lib/experience';
import { formatNumber } from '../../lib/format';
import { REACH_SHORT_LABELS } from '../../lib/reach';
import { galleryPath } from '../../lib/paths';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { useProjects } from '../../hooks/useProjects';
import { PageLayout } from '../../app/PageLayout';
import { Container } from '../../components/layout/Container';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ChartCard } from './ChartCard';
import { CUMULATIVE_NOTES } from './chartNotes';
import { CumulativeLineChart } from './CumulativeLineChart';
import { HBarChart } from './HBarChart';
import {
  builtWith,
  cumulativeByYear,
  experienceByMonth,
  reachBuckets,
  resourcesUsed,
  submissionsByYear,
  topTags,
  vibeCodedByMonth,
} from './selectors';
import { StackedBarChart } from './StackedBarChart';
import { YearBarChart } from './YearBarChart';
import styles from './ChartsPage.module.css';

const EXPERIENCE_COLORS = [
  'var(--chart-purple-1)',
  'var(--chart-purple-2)',
  'var(--chart-purple-3)',
  'var(--chart-purple-4)',
];
const EXPERIENCE_SERIES = EXPERIENCE_LEVELS.map((key, i) => ({
  key,
  label: EXPERIENCE_LABELS[key],
  color: EXPERIENCE_COLORS[i] ?? 'var(--chart-neutral)',
}));
const VIBE_SERIES = [
  { key: 'vibe', label: 'Vibe-coded', color: 'var(--chart-purple-3)' },
  { key: 'notVibe', label: 'Not vibe-coded', color: 'var(--chart-neutral)' },
];

const TITLE = 'Powered by Sefaria in numbers';

/** Unlisted, noindex analytics page. */
export function ChartsPage() {
  useDocumentMeta({ title: TITLE, robots: 'noindex, nofollow' });
  const data = useProjects();
  const now = useMemo(() => new Date(), []);

  return (
    <PageLayout
      skipTo={{ id: 'charts-title', label: 'Skip to charts' }}
      backLink={{ to: galleryPath(), label: 'All projects' }}
    >
      <div className={styles.page}>
        <Container className={styles.container}>
          <h1 id="charts-title" tabIndex={-1} className={styles.title}>
            {TITLE}
          </h1>
          <p className={styles.notice}>
            <TriangleAlert size={18} strokeWidth={2} color="var(--feedback-warning)" aria-hidden="true" />
            We&rsquo;re revising how this data is collected, so some figures may be out of date.
          </p>
          {data.status === 'loading' && (
            <div className={styles.grid} aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonCard}>
                  <Skeleton width="50%" height={24} />
                  <Skeleton width="100%" height={260} />
                </div>
              ))}
            </div>
          )}
          {data.status === 'error' && (
            <EmptyState
              title="We couldn't load the data right now."
              description="Check your connection and try again."
              action={<Button onClick={data.retry}>Try again</Button>}
            />
          )}
          {data.status === 'success' && <Charts projects={data.projects} now={now} />}
        </Container>
      </div>
    </PageLayout>
  );
}

function Charts({ projects, now }: { projects: Parameters<typeof submissionsByYear>[0]; now: Date }) {
  const byYear = useMemo(() => submissionsByYear(projects, now), [projects, now]);
  const cumulative = useMemo(() => cumulativeByYear(projects, now), [projects, now]);
  const experience = useMemo(() => experienceByMonth(projects, now), [projects, now]);
  const vibe = useMemo(() => vibeCodedByMonth(projects, now), [projects, now]);
  const tags = useMemo(() => topTags(projects), [projects]);
  const resources = useMemo(() => resourcesUsed(projects), [projects]);
  const tech = useMemo(() => builtWith(projects), [projects]);
  const reach = useMemo(() => reachBuckets(projects), [projects]);

  return (
    <div className={styles.grid}>
      <ChartCard
        title="Submissions by year"
        subtitle="Projects submitted each year"
        headerRight={
          <p className={styles.total}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalValue}>{formatNumber(byYear.total)}</span>
          </p>
        }
        footnote={`Total is the all-time count. ${byYear.undated} projects have no submission date and aren't plotted.`}
        table={{
          caption: 'Submissions by year',
          columns: ['Year', 'Projects'],
          rows: byYear.rows.map((r) => [r.year, r.count]),
        }}
      >
        <YearBarChart
          rows={byYear.rows}
          ariaLabel="Bar chart of projects submitted per year. The same numbers are in the table below."
        />
      </ChartCard>

      <ChartCard
        title="Projects over time"
        subtitle="Cumulative projects with a submission date"
        footnote={
          <ol className={styles.notes}>
            {CUMULATIVE_NOTES.map((note, i) => (
              <li key={note.text}>
                <span className={styles.noteNumber} aria-hidden="true">
                  {i + 1}
                </span>
                {note.text}
              </li>
            ))}
          </ol>
        }
        table={{
          caption: 'Projects over time',
          columns: ['Year', 'Total projects'],
          rows: cumulative.map((r) => [r.year, r.total]),
        }}
      >
        <CumulativeLineChart
          rows={cumulative}
          notes={CUMULATIVE_NOTES}
          ariaLabel="Line chart of cumulative projects by year. The same numbers are in the table below."
        />
      </ChartCard>

      <ChartCard
        title="Submissions by experience level"
        subtitle="Monthly submissions by self-reported programming experience"
        legend={EXPERIENCE_SERIES}
        footnote={`Only the ${experience.n} dated projects that reported experience are shown. Experience levels: No experience, Beginner (<5 years), Intermediate (5–10), Advanced (10+).`}
        table={{
          caption: 'Submissions by experience level',
          columns: ['Month', ...EXPERIENCE_SERIES.map((s) => s.label), 'Total'],
          rows: experience.rows.map((r) => [r.month, ...EXPERIENCE_LEVELS.map((l) => r[l]), r.total]),
        }}
      >
        <StackedBarChart
          rows={experience.rows}
          series={EXPERIENCE_SERIES}
          ariaLabel="Stacked bar chart of monthly submissions by experience level. The same numbers are in the table below."
        />
      </ChartCard>

      <ChartCard
        title="Vibe-coded vs. not, tracked since July 2026"
        subtitle="Monthly submissions, last 12 completed months"
        legend={VIBE_SERIES}
        footnote={
          '"Vibe-coded" is a newly tracked field, so months before July 2026 may be undercounted or unreported rather than confirmed not vibe-coded.'
        }
        table={{
          caption: 'Vibe-coded vs. not',
          columns: ['Month', 'Vibe-coded', 'Not vibe-coded', 'Total'],
          rows: vibe.map((r) => [r.month, r.vibe, r.notVibe, r.total]),
        }}
      >
        <StackedBarChart
          rows={vibe}
          series={VIBE_SERIES}
          ariaLabel="Stacked bar chart of vibe-coded and other projects by month. The same numbers are in the table below."
        />
      </ChartCard>

      <ChartCard
        title="Projects by Tag"
        subtitle="Top 10 topics by number of projects"
        footnote={`Language tag "English" (${tags.englishCount}) hidden so it doesn't swamp the topics.`}
        table={{
          caption: 'Projects by tag',
          columns: ['Tag', 'Projects'],
          rows: tags.rows.map((r) => [r.label, r.count]),
        }}
      >
        <HBarChart rows={tags.rows.map((r) => ({ label: r.label, value: r.count }))} ariaLabel="Projects by tag" />
      </ChartCard>

      <ChartCard
        title="Sefaria resources used"
        subtitle="Projects using each kind of Sefaria resource"
        footnote="Endpoint versions grouped (e.g. /api/texts and /api/v3/texts → Texts)."
        table={{
          caption: 'Sefaria resources used',
          columns: ['Resource', 'Projects'],
          rows: resources.map((r) => [r.label, r.count]),
        }}
      >
        <HBarChart
          rows={resources.map((r) => ({ label: r.label, value: r.count }))}
          ariaLabel="Sefaria resources used"
        />
      </ChartCard>

      <ChartCard
        title="Built with"
        subtitle="Top 8 technologies named in project stacks"
        footnote={`From ${tech.n} projects that described their stack. Matched from free text, so a project can count toward several.`}
        table={{
          caption: 'Built with',
          columns: ['Technology', 'Projects'],
          rows: tech.rows.map((r) => [r.label, r.count]),
        }}
      >
        <HBarChart
          rows={tech.rows.map((r) => ({ label: r.label, value: r.count }))}
          ariaLabel="Technologies projects are built with"
        />
      </ChartCard>

      <ChartCard
        title="Reported reach"
        subtitle="Approximate users, as reported by project owners"
        footnote={`Self-reported by ${reach.reported} of ${reach.total} projects; the rest left it blank.`}
        table={{
          caption: 'Reported reach',
          columns: ['Reach', 'Projects'],
          rows: reach.rows.map((r) => [REACH_SHORT_LABELS[r.bucket], r.count]),
        }}
      >
        <HBarChart
          rows={reach.rows.map((r) => ({ label: REACH_SHORT_LABELS[r.bucket], value: r.count }))}
          ariaLabel="Reported reach"
        />
      </ChartCard>
    </div>
  );
}
