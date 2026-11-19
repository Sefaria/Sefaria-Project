import { forwardRef, type CSSProperties } from 'react';
import { CATEGORY_META } from '../../lib/categories';
import type { Project } from '../../lib/project';
import { CategoryIcon } from '../../components/icons/CategoryIcon';
import { SourceButton } from './ProjectCta';
import styles from './ProjectHeader.module.css';

interface ProjectHeaderProps {
  project: Project;
  /** Below 600px "View source code" sits under the description. */
  showSource: boolean;
}

export const ProjectHeader = forwardRef<HTMLHeadingElement, ProjectHeaderProps>(function ProjectHeader(
  { project, showSource },
  ref
) {
  const categories = project.categories.length > 0 ? project.categories : (['none'] as const);
  return (
    <header className={styles.root}>
      <ul className={styles.chips}>
        {categories.map((id) => (
          <li key={id}>
            <span
              className={styles.chip}
              style={
                {
                  '--chip-color': CATEGORY_META[id].colorVar,
                  '--chip-text': CATEGORY_META[id].textVar,
                } as CSSProperties
              }
            >
              <CategoryIcon id={id} size={16} />
              {CATEGORY_META[id].label}
            </span>
          </li>
        ))}
      </ul>
      <h1 ref={ref} tabIndex={-1} className={styles.title}>
        {project.name}
      </h1>
      {project.description && <p className={styles.description}>{project.description}</p>}
      {showSource && project.sourceUrl && (
        <div className={styles.source}>
          <SourceButton project={project} />
        </div>
      )}
    </header>
  );
});
