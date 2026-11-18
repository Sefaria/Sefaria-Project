import { Link } from 'react-router';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { track, type AnalyticsEvents } from '../../lib/analytics';
import type { Project } from '../../lib/project';
import { FROM_BROWSE, projectPath } from '../../lib/slug';
import styles from './ProjectAction.module.css';

type Surface = AnalyticsEvents['project_outbound']['surface'];

/**
 * The 44px button in a card or row. A project with known issues goes to its own page, where
 * the notice explains; any other opens the project's site. Sits above the card's stretched
 * click overlay. Renders nothing for a healthy project without a URL.
 */
export function ProjectAction({
  project,
  surface,
}: {
  project: Pick<Project, 'id' | 'name' | 'url' | 'isBuggy'>;
  surface: Surface;
}) {
  if (project.isBuggy) {
    return (
      <Link
        to={projectPath(project)}
        state={FROM_BROWSE}
        className={styles.link}
        aria-label={`About ${project.name}`}
        title="About this project"
      >
        <ArrowRight size={20} strokeWidth={2} aria-hidden="true" />
      </Link>
    );
  }
  if (!project.url) return null;
  return (
    <a
      href={project.url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}
      aria-label={`Visit ${project.name} (opens in a new tab)`}
      title="Open project"
      onClick={() => track('project_outbound', { project_id: project.id, surface, has_issues: false })}
    >
      <ArrowUpRight size={20} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}
