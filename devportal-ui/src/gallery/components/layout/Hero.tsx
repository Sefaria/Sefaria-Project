import { ArrowUpRight } from 'lucide-react';
import { formatNumber } from '../../lib/format';
import { Button, ButtonLink } from '../ui/Button';
import { ExternalLink } from '../ui/ExternalLink';
import { Container } from './Container';
import { Constellation } from './Constellation';
import { DEVELOPERS_URL } from '../../lib/links';
import styles from './Hero.module.css';

interface HeroProps {
  /** Number of projects available, or null while loading. */
  projectCount: number | null;
  onExplore: () => void;
}

export function Hero({ projectCount, onExplore }: HeroProps) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <Constellation />
      <Container className={styles.container}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>COMMUNITY SHOWCASE</p>
          <h1 id="hero-title" className={styles.title}>
            Apps built on Sefaria’s open Jewish library.
          </h1>
          <p className={styles.lead}>
            Sefaria is the hub for Torah innovation. Our entire library of Jewish texts is free for anyone to build
            with, and people around the world have used it to make study tools, AI assistants, research projects, and
            more.
          </p>
          <div className={styles.actions}>
            <Button variant="inverse" className={styles.action} onClick={onExplore}>
              {projectCount === null ? 'Explore projects' : `Explore ${formatNumber(projectCount)} projects`}
            </Button>
            <ButtonLink variant="inverse-outline" href={DEVELOPERS_URL} className={styles.action}>
              Build with Sefaria
            </ButtonLink>
          </div>
        </div>
        <figure className={styles.quote}>
          <blockquote>
            <p lang="he" dir="rtl" className={styles.hebrew}>
              אי אפשר לבית מדרש בלא חידוש
            </p>
          </blockquote>
          <figcaption className={styles.caption}>
            There cannot be a study hall without innovation.{' '}
            <ExternalLink href="https://www.sefaria.org/Chagigah.3a.15?lang=bi" className={styles.source}>
              Chagigah 3a <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
            </ExternalLink>
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
