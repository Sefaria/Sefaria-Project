import './NotFoundPage.css';

export interface NotFoundSuggestion {
  title: string;
  path: string;
}

/**
 * C6 `NotFoundPage` (I-14): live's ReadMe 404 body. "Page Not Found", the prompt, and up to three
 * suggestions chosen by the server (C3 `NotFoundPayload.suggestions`). Live's title is an `h2`; the
 * portal uses the page's one `h1` (C6). Global `dp-notfound*` classes: devportal/templates/devportal/404.html
 * renders the same markup on the server. `data-visual*` are the visual-parity hooks (live's suggestions are
 * chosen at random per load, so they are masked).
 */
export function NotFoundPage({ suggestions }: { suggestions: readonly NotFoundSuggestion[] }) {
  return (
    <div className="dp-notfound">
      <h1 className="dp-notfound-title" data-visual-region="notFound">
        Page Not Found
      </h1>
      {suggestions.length > 0 && (
        <div className="dp-notfound-suggestions" data-visual-region="notFound">
          <p className="dp-notfound-prompt">
            {suggestions.length === 1 ? 'Maybe you were looking for this:' : 'Maybe you were looking for one of these:'}
          </p>
          <ul className="dp-notfound-list" data-visual-mask="notFoundSuggestions">
            {suggestions.slice(0, 3).map((suggestion) => (
              <li key={suggestion.path}>
                <a className="dp-notfound-link" href={suggestion.path}>
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
