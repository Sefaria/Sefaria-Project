import { Link } from 'react-router';
import { galleryPath } from '../lib/paths';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { Container } from '../components/layout/Container';
import { PageLayout } from './PageLayout';
import styles from './NotFound.module.css';

export function NotFound() {
  useDocumentMeta({ title: 'Page not found | Powered by Sefaria', robots: 'noindex, nofollow' });
  return (
    <PageLayout skipTo={{ id: 'not-found-title', label: 'Skip to content' }}>
      <Container className={styles.root}>
        <h1 id="not-found-title" tabIndex={-1} className={styles.title}>
          Page not found
        </h1>
        <p className={styles.text}>That page doesn&rsquo;t exist.</p>
        <Link to={galleryPath()} className={styles.link}>
          Browse all projects
        </Link>
      </Container>
    </PageLayout>
  );
}
