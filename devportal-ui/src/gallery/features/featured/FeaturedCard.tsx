import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { track } from '../../lib/analytics';
import { CATEGORY_META } from '../../lib/categories';
import { madeWithResources } from '../../lib/madeWith';
import type { Project } from '../../lib/project';
import { galleryAsset } from '../../lib/paths';
import { FROM_BROWSE, projectPath } from '../../lib/slug';
import { ProjectAction } from '../../components/ui/ProjectAction';
import styles from './FeaturedCard.module.css';

interface FeaturedCardProps {
  project: Project;
  /** 1-based place in the band, for analytics. */
  position: number;
}

/** A larger ProjectCard for the featured band: static category art, a "Made with" tag. The title links to the project's page. */
export function FeaturedCard({ project, position }: FeaturedCardProps) {
  const categoryId = project.categories[0] ?? 'none';
  const { label, Icon, colorVar } = CATEGORY_META[categoryId];
  const resources = madeWithResources(project);
  return (
    <article className={styles.card}>
      <div className={styles.art} style={{ '--art-color': colorVar } as CSSProperties} aria-hidden="true">
        <img
          className={styles.image}
          src={galleryAsset(`category-art/${categoryId}.svg`)}
          alt=""
          loading="lazy"
          decoding="async"
        />
        <span className={styles.tile}>
          <Icon size={26} strokeWidth={2} />
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.category}>{label}</span>
          <ProjectAction project={project} surface="featured" />
        </div>
        <h3 className={styles.heading}>
          <Link
            to={projectPath(project)}
            state={FROM_BROWSE}
            className={styles.title}
            onClick={() => track('featured_open', { project_id: project.id, position })}
          >
            {project.name}
          </Link>
        </h3>
        {project.description && <p className={styles.description}>{project.description}</p>}
        <p className={styles.madeWith}>
          <span className={styles.madeWithLabel}>Made with</span>
          <span className={styles.madeWithValue}>{resources.join(' \u00b7 ')}</span>
        </p>
      </div>
    </article>
  );
}
