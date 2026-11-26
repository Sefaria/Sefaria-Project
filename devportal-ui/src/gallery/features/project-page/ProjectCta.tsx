import { CodeXml, Globe } from 'lucide-react';
import { track } from '../../lib/analytics';
import { cx } from '../../components/ui/cx';
import type { Project } from '../../lib/project';
import { ButtonLink } from '../../components/ui/Button';
import { KnownIssuesNotice } from './KnownIssuesNotice';
import styles from './ProjectCta.module.css';

interface ProjectCtaProps {
  project: Project;
  /** Below 600px "View source code" lives in the header instead. */
  showSource: boolean;
  /** Grid placement, from the page. */
  className?: string;
}

/** The same markup at every width; CSS grid areas and position decide where it sits. */
export function ProjectCta({ project, showSource, className }: ProjectCtaProps) {
  const { url, domain, sourceUrl, isBuggy } = project;
  const hasSource = showSource && sourceUrl !== null;
  if (!url && !hasSource && !isBuggy) return null;
  return (
    <aside className={cx(styles.root, className)} aria-label="Open this project">
      {isBuggy && <KnownIssuesNotice />}
      {url && (
        <div className={styles.buttons}>
          <ButtonLink
            variant={isBuggy ? 'accent-outline' : 'accent'}
            size="lg"
            href={url}
            className={styles.button}
            onClick={() =>
              track('project_outbound', {
                project_id: project.id,
                surface: 'page',
                has_issues: isBuggy,
              })
            }
          >
            {isBuggy ? 'Open anyway' : `Open ${project.name}`}
          </ButtonLink>
          {hasSource && sourceUrl && <SourceButton project={project} className={styles.button} />}
        </div>
      )}
      {!url && hasSource && sourceUrl && <SourceButton project={project} />}
      {url && domain && (
        <p className={styles.helper}>
          <Globe size={16} strokeWidth={2} aria-hidden="true" className={styles.globe} />
          <span>{domain} · opens in a new tab</span>
        </p>
      )}
    </aside>
  );
}

export function SourceButton({ project, className }: { project: Project; className?: string }) {
  if (!project.sourceUrl) return null;
  return (
    <ButtonLink
      variant="accent-outline"
      size="lg"
      href={project.sourceUrl}
      arrow={false}
      icon={<CodeXml size={20} strokeWidth={2} aria-hidden="true" />}
      className={className}
      onClick={() => track('project_source', { project_id: project.id })}
    >
      View source code
    </ButtonLink>
  );
}
