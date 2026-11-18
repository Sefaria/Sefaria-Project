import { useEffect, useRef } from 'react';
import { Link, Navigate, useLocation, useNavigationType, useParams } from 'react-router';
import { trackPageview } from '../../lib/analytics';
import { galleryPath } from '../../lib/paths';
import { canonicalPath, parseSlug } from '../../lib/slug';
import { MEDIA_SM, useMediaQuery } from '../../hooks/useMediaQuery';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { useProjects } from '../../hooks/useProjects';
import { PageLayout } from '../../app/PageLayout';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import type { Project } from '../../lib/project';
import { Breadcrumb } from './Breadcrumb';
import { ProjectCta } from './ProjectCta';
import { ProjectDetails } from './ProjectDetails';
import { ProjectHeader } from './ProjectHeader';
import { RelatedProjects } from './RelatedProjects';
import styles from './ProjectPage.module.css';

const SKIP = { id: 'project-main', label: 'Skip to project' };

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function ProjectPage() {
  const { slug } = useParams();
  const data = useProjects();
  const parsed = parseSlug(slug);
  const project = parsed && data.projects ? data.projects.find((p) => p.id === parsed.id) : null;

  if (data.status === 'error') {
    return (
      <PageShell>
        <EmptyState
          title="We couldn't load this project right now."
          description="Check your connection and try again."
          action={<Button onClick={data.retry}>Try again</Button>}
        />
      </PageShell>
    );
  }
  if (!parsed || (data.status === 'success' && !project)) return <ProjectNotFound />;
  if (!project || !data.projects) return <ProjectSkeleton />;
  return <ProjectView project={project} all={data.projects} slug={slug} />;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout skipTo={SKIP}>
      <div className={styles.page} id={SKIP.id} tabIndex={-1}>
        {children}
      </div>
    </PageLayout>
  );
}

function ProjectSkeleton() {
  useDocumentMeta({ title: 'Loading… · Powered by Sefaria' });
  return (
    <PageShell>
      <div aria-busy="true" aria-label="Loading project" role="status" className={styles.skeleton}>
        <Skeleton width={120} height={24} />
        <Skeleton width={160} height={32} />
        <Skeleton width="60%" height={52} />
        <Skeleton width="80%" height={72} />
      </div>
    </PageShell>
  );
}

function ProjectNotFound() {
  useDocumentMeta({
    title: 'Project not found · Powered by Sefaria',
    robots: 'noindex, nofollow',
    status: 404,
  });
  return (
    <PageShell>
      <div className={styles.notFound}>
        <h1 tabIndex={-1} className={styles.notFoundTitle}>
          Project not found
        </h1>
        <p>That project doesn&rsquo;t exist, or it isn&rsquo;t published.</p>
        <Link to={galleryPath()} className={styles.notFoundLink}>
          All projects
        </Link>
      </div>
    </PageShell>
  );
}

function ProjectView({ project, all, slug }: { project: Project; all: readonly Project[]; slug: string | undefined }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const stacked = !useMediaQuery(MEDIA_SM); // the < 600px layout is close enough to < 640px for source placement
  const headingRef = useRef<HTMLHeadingElement>(null);
  const canonical = canonicalPath(slug, project);

  useDocumentMeta({
    title: `${project.name} · Powered by Sefaria`,
    description: truncate(project.description || project.backstory || '', 155) || undefined,
    // The request origin plus /powered-by/projects/<slug> (PLAN §2.14 item 3).
    canonical: `${window.location.origin}${canonical ?? location.pathname}`,
  });

  // After a client-side navigation, move focus to the h1 so screen readers start at the page.
  // (a REPLACE is the canonical-slug redirect, not the reader going somewhere)
  const navigated = location.key !== 'default' && navigationType !== 'REPLACE';
  useEffect(() => {
    if (navigated) headingRef.current?.focus({ preventScroll: true });
  }, [navigated, project.id]);

  const redirecting = canonical !== null;
  useEffect(() => {
    if (!redirecting) trackPageview(location.pathname);
  }, [redirecting, location.pathname]);

  if (canonical) return <Navigate to={canonical} replace state={location.state} />;

  return (
    <PageLayout skipTo={SKIP}>
      <div className={styles.page} id={SKIP.id} tabIndex={-1}>
        <Breadcrumb name={project.name} />
        <div className={styles.layout}>
          <div className={styles.head}>
            <ProjectHeader ref={headingRef} project={project} showSource={stacked} />
          </div>
          <ProjectCta project={project} showSource={!stacked} className={styles.cta} />
          <div className={styles.body}>
            <ProjectDetails project={project} />
          </div>
        </div>
        <RelatedProjects project={project} all={all} />
      </div>
    </PageLayout>
  );
}
