import styles from './NotFoundPage.module.css';

export interface NotFoundSuggestion {
  title: string;
  path: string;
}

/**
 * C6 `NotFoundPage` (I-14): live's ReadMe 404 body. "Page Not Found", the prompt, and up to three
 * suggestions chosen by the server (C3 `NotFoundPayload.suggestions`). Live's title is an `h2`; the
 * portal uses the page's one `h1` (C6).
 */
export function NotFoundPage({ suggestions }: { suggestions: readonly NotFoundSuggestion[] }) {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Page Not Found</h1>
      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          <p className={styles.prompt}>Maybe you were looking for one of these:</p>
          <ul className={styles.list}>
            {suggestions.slice(0, 3).map((suggestion) => (
              <li key={suggestion.path}>
                <a className={styles.link} href={suggestion.path}>
                  {suggestion.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
