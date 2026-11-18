import { Link } from 'react-router';
import { CATEGORY_META } from '../../lib/categories';
import type { CategoryFilter } from '../../lib/filter';
import type { Project } from '../../lib/project';
import { FROM_BROWSE, projectPath } from '../../lib/slug';
import { CategoryTile } from '../../components/icons/CategoryIcon';
import { ProjectAction } from '../../components/ui/ProjectAction';
import { TopicTags } from './TopicTags';
import styles from './ProjectCard.module.css';

interface ProjectCardProps {
  project: Project;
  /** When the list is filtered by a category, the card shows that one. */
  activeCategory: CategoryFilter;
  resultIndex: number;
}

/** The title links to the project's page and its ::after makes the whole card clickable; the action button in the header sits above it. */
export function ProjectCard({ project, activeCategory, resultIndex }: ProjectCardProps) {
  const categoryId = activeCategory !== 'all' ? activeCategory : (project.categories[0] ?? 'none');
  const topics = project.topics.slice(0, 3);
  return (
    <article className={styles.card}>
      <div className={styles.category}>
        <CategoryTile id={categoryId} />
        <span className={styles.categoryLabel}>{CATEGORY_META[categoryId].label}</span>
        <ProjectAction project={project} surface="card" />
      </div>
      <h3 className={styles.heading}>
        <Link to={projectPath(project)} state={FROM_BROWSE} className={styles.title} data-result-index={resultIndex}>
          {project.name}
        </Link>
      </h3>
      {project.description && <p className={styles.description}>{project.description}</p>}
      {topics.length > 0 && <TopicTags topics={topics} size="sm" />}
    </article>
  );
}
