import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { CATEGORY_META, type CategoryId } from '../../lib/categories';
import type { CategoryFilter } from '../../lib/filter';
import { formatDate } from '../../lib/format';
import type { Project } from '../../lib/project';
import { FROM_BROWSE, projectPath } from '../../lib/slug';
import { MEDIA_SM, useMediaQuery } from '../../hooks/useMediaQuery';
import { CategoryTile } from '../../components/icons/CategoryIcon';
import { ProjectAction } from '../../components/ui/ProjectAction';
import { VisuallyHidden } from '../../components/ui/VisuallyHidden';
import { TopicTags } from './TopicTags';
import styles from './ProjectList.module.css';

interface ProjectListProps {
  projects: readonly Project[];
  activeCategory: CategoryFilter;
}

function displayCategory(project: Project, active: CategoryFilter): CategoryId {
  return active !== 'all' ? active : (project.categories[0] ?? 'none');
}

/** A table from 640px, and 72px tappable rows below. */
export function ProjectList(props: ProjectListProps) {
  const wide = useMediaQuery(MEDIA_SM);
  return wide ? <ProjectTable {...props} /> : <ProjectRows {...props} />;
}

function ProjectTable({ projects, activeCategory }: ProjectListProps) {
  return (
    // A scrollable region must be keyboard-focusable so the clipped columns are reachable.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={styles.scroller} tabIndex={0} role="region" aria-label="Projects table">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.projectCol}>
              Project
            </th>
            <th scope="col">Category</th>
            <th scope="col">Topics</th>
            <th scope="col">Submitted</th>
            <th scope="col" className={styles.visitCol}>
              <VisuallyHidden>Visit</VisuallyHidden>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project, index) => {
            const category = displayCategory(project, activeCategory);
            return (
              <tr key={project.id}>
                <td>
                  <div className={styles.projectCell}>
                    <CategoryTile id={category} size="sm" />
                    <div className={styles.projectText}>
                      <div className={styles.nameLine}>
                        <Link
                          to={projectPath(project)}
                          state={FROM_BROWSE}
                          className={styles.name}
                          data-result-index={index}
                        >
                          {project.name}
                        </Link>
                      </div>
                      {project.description && <p className={styles.oneLine}>{project.description}</p>}
                    </div>
                  </div>
                </td>
                <td className={styles.category}>{CATEGORY_META[category].label}</td>
                <td className={styles.topics}>
                  <TopicTags topics={project.topics.slice(0, 3)} size="xs" />
                </td>
                <td className={styles.date}>{project.submittedAt ? formatDate(project.submittedAt) : ''}</td>
                <td>
                  <ProjectAction project={project} surface="list" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRows({ projects, activeCategory }: ProjectListProps) {
  return (
    <ul className={styles.rows}>
      {projects.map((project, index) => {
        const category = displayCategory(project, activeCategory);
        const subline = [CATEGORY_META[category].label, project.topics.join(', ')].filter(Boolean).join(' · ');
        return (
          <li key={project.id}>
            <Link to={projectPath(project)} state={FROM_BROWSE} className={styles.row} data-result-index={index}>
              <CategoryTile id={category} size="sm" />
              <span className={styles.rowText}>
                <span className={styles.rowNameLine}>
                  <span className={styles.rowName}>{project.name}</span>
                </span>
                <span className={styles.rowSub}>{subline}</span>
              </span>
              <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
