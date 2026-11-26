import { Link } from 'react-router';
import { CATEGORY_META } from '../../lib/categories';
import { getRelatedProjects } from '../../lib/related';
import type { Project } from '../../lib/project';
import { projectPath } from '../../lib/slug';
import styles from './RelatedProjects.module.css';

export function RelatedProjects({ project, all }: { project: Project; all: readonly Project[] }) {
  const related = getRelatedProjects(project, all);
  if (related.length === 0) return null;
  const label = CATEGORY_META[project.categories[0] ?? 'none'].label;
  return (
    <section className={styles.root} aria-labelledby="related-heading">
      <h2 id="related-heading" className={styles.heading}>
        More in {label}
      </h2>
      <ul className={styles.cards}>
        {related.map((p) => (
          <li key={p.id}>
            <Link to={projectPath(p)} className={styles.card}>
              <span className={styles.title}>{p.name}</span>
              {p.description && <span className={styles.description}>{p.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
