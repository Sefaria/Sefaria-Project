import type { Project } from '../../lib/project';
import { MEDIA_BAND_GRID, useMediaQuery } from '../../hooks/useMediaQuery';
import { Container } from '../../components/layout/Container';
import { FeaturedCard } from './FeaturedCard';
import styles from './FeaturedProjects.module.css';

interface FeaturedProjectsProps {
  /** From getFeaturedProjects: already filtered, sorted and capped. */
  projects: readonly Project[];
}

/** The band between the hero and the browse area. Renders nothing when no project is featured. */
export function FeaturedProjects({ projects }: FeaturedProjectsProps) {
  const grid = useMediaQuery(MEDIA_BAND_GRID);
  if (projects.length === 0) return null;

  // Below 900px the cards scroll sideways, so the scroller must be focusable and named.
  const scrollerProps = grid ? {} : { tabIndex: 0, role: 'region', 'aria-label': 'Featured Projects, scrollable' };

  return (
    <section className={styles.band} aria-labelledby="featured-heading">
      <Container className={styles.inner}>
        <div className={styles.header}>
          <h2 id="featured-heading" className={styles.heading}>
            Featured Projects
          </h2>
          <p className={styles.subtitle}>Hand-picked by the Developers on Sefaria team</p>
        </div>
        <div className={styles.scroller} {...scrollerProps}>
          <ul className={styles.cards}>
            {projects.map((project, index) => (
              <li key={project.id} className={styles.item}>
                <FeaturedCard project={project} position={index + 1} />
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
