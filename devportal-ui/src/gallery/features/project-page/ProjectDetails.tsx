import type { ReactNode } from 'react';
import { formatDate, stripWrappingQuotes } from '../../lib/format';
import { detailTopics, type Project } from '../../lib/project';
import { formatReach } from '../../lib/reach';
import { Tag } from '../../components/ui/Tag';
import styles from './ProjectDetails.module.css';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt className={styles.dt}>{label}</dt>
      <dd className={styles.dd}>{children}</dd>
    </div>
  );
}

/** The creator's own words and the details list. Sections and rows with no data are omitted. */
export function ProjectDetails({ project }: { project: Project }) {
  const topics = detailTopics(project);
  const creatorWords = stripWrappingQuotes(project.backstory ?? '');
  const paragraphs = creatorWords.split(/\n\s*\n/).map((p) => p.trim());
  const hasDetails =
    project.resources.length > 0 ||
    project.builtWith !== null ||
    topics.length > 0 ||
    project.reach !== null ||
    project.submittedAt !== null;

  return (
    <div className={styles.root}>
      {creatorWords && (
        <section aria-labelledby="why">
          <h2 id="why" className={styles.heading}>
            In the creator’s words
          </h2>
          <figure className={styles.quote}>
            <blockquote>
              {paragraphs.map((paragraph, i) => (
                // Multi-paragraph quotes open each paragraph and close only the last.
                <p key={i}>
                  “{paragraph}
                  {i === paragraphs.length - 1 && '”'}
                </p>
              ))}
            </blockquote>
            <figcaption>Written by the project’s creator</figcaption>
          </figure>
        </section>
      )}
      {hasDetails && (
        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className={styles.heading}>
            Details
          </h2>
          <dl className={styles.list}>
            {project.resources.length > 0 && (
              <Row label="Sefaria resources used">
                <ul className={styles.tags}>
                  {project.resources.map((resource) => (
                    <li key={resource}>
                      <Tag variant="resource">{resource}</Tag>
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {project.builtWith && <Row label="Built with">{project.builtWith}</Row>}
            {topics.length > 0 && (
              <Row label="Topics">
                <ul className={styles.tags}>
                  {topics.map((topic) => (
                    <li key={topic}>
                      <Tag variant="topic">{topic}</Tag>
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {project.reach && (
              <Row label="Reported reach">
                {formatReach(project.reach)} <span className={styles.suffix}>· approximate, self-reported</span>
              </Row>
            )}
            {project.submittedAt && <Row label="Submitted">{formatDate(project.submittedAt)}</Row>}
          </dl>
        </section>
      )}
    </div>
  );
}
