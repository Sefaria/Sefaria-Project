import type { CategoryFilter } from '../../lib/filter';
import type { Project } from '../../lib/project';
import { ProjectCard } from './ProjectCard';
import styles from './ProjectGrid.module.css';

interface ProjectGridProps {
  projects: readonly Project[];
  activeCategory: CategoryFilter;
}

export function ProjectGrid({ projects, activeCategory }: ProjectGridProps) {
  return (
    <ul className={styles.grid}>
      {projects.map((project, index) => (
        <li key={project.id}>
          <ProjectCard project={project} activeCategory={activeCategory} resultIndex={index} />
        </li>
      ))}
    </ul>
  );
}
