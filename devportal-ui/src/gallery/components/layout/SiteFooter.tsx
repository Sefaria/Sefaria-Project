import { analyticsEnabled } from '../../lib/analytics';
import { ExternalLink } from '../ui/ExternalLink';
import { Container } from './Container';
import { DEVELOPERS_URL, DONATE_URL, SEFARIA_URL } from '../../lib/links';
import styles from './SiteFooter.module.css';

const LINKS = [
  { label: 'Sefaria.org', href: SEFARIA_URL },
  { label: 'Developer Portal', href: DEVELOPERS_URL },
  { label: 'Sefaria on GitHub', href: 'https://github.com/Sefaria' },
  { label: 'Donate', href: DONATE_URL },
] as const;

export const PRIVACY_URL = 'https://www.sefaria.org/privacy-policy';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.about}>
          <p className={styles.title}>Powered by Sefaria</p>
          <p className={styles.body}>
            A showcase of independent projects built with Sefaria&rsquo;s free texts, API, and data. Each project is
            created and maintained by its own developers.
          </p>
          {analyticsEnabled() && (
            <p className={styles.privacy}>
              <ExternalLink href={PRIVACY_URL} className={styles.privacyLink}>
                We count visits anonymously, without cookies.
              </ExternalLink>
            </p>
          )}
        </div>
        <nav aria-label="Footer">
          <ul className={styles.links}>
            {LINKS.map((link) => (
              <li key={link.href} className={styles.item}>
                <ExternalLink href={link.href} className={styles.link}>
                  {link.label}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
