// The right column of an endpoint page (live's #ReferencePlayground): language picker, request card with the code
// sample and Try It, response card with examples or the Try It result, and the request-panel Discord prompt (D-3).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatBody } from '../tryit/send';
import { MORE_LANGUAGES, PRIMARY_LANGUAGES, requestLabel, type Language } from '../snippets/languages';
import { useEndpoint, type ResponseView } from '../state';
import { DotGridIcon, Icon, LanguageIcon } from '../ui/icons';
import { CopyButton, Dropdown, MenuHeader, MenuItem, StatusDot } from '../ui/primitives';
import { CodeView, ResponseViewer } from './CodeView';
import styles from './Playground.module.css';

function LanguagePicker() {
  const { language, setLanguage } = useEndpoint();
  const chosenMore = MORE_LANGUAGES.find((l) => l.id === language.id);
  const buttons: Language[] = chosenMore === undefined ? PRIMARY_LANGUAGES : [...PRIMARY_LANGUAGES, chosenMore];
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.languageHeading} data-visual="langHeader">
          Language
        </h2>
      </header>
      <div className={styles.languages} data-visual-region="languagePicker">
        {buttons.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={l.id === language.id}
            data-visual={l.id === language.id ? 'langBtnActive' : 'langBtn'}
            className={[styles.languageButton, l.id === language.id ? styles.languageActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setLanguage(l.id)}
          >
            <LanguageIcon name={l.icon} className={styles.languageIcon} />
            {l.label}
          </button>
        ))}
        <Dropdown
          align="end"
          popup="dialog"
          label="More Languages"
          wholePixels
          trigger={(props) => (
            <button
              type="button"
              className={styles.moreButton}
              aria-label="More Languages"
              data-visual="langMore"
              {...props}
            >
              <DotGridIcon className={styles.moreIcon} />
            </button>
          )}
        >
          {(close) => (
            <div role="menu" aria-label="More Languages" className={styles.menuList}>
              {MORE_LANGUAGES.map((l) => (
                <MenuItem
                  key={l.id}
                  active={l.id === language.id}
                  icon={<LanguageIcon name={l.icon} className={styles.menuIcon} />}
                  onSelect={() => {
                    setLanguage(l.id);
                    close();
                  }}
                >
                  {l.label}
                </MenuItem>
              ))}
            </div>
          )}
        </Dropdown>
      </div>
    </section>
  );
}

function RequestExamples() {
  const { op, form, setValues, values } = useEndpoint();
  const media = op.requestBody === null ? undefined : Object.values(op.requestBody.content)[0];
  const examples = Object.entries(media?.examples ?? {});
  if (examples.length === 0) return null;
  const apply = (value: unknown) => {
    const next = { ...values };
    const walk = (fields: typeof form.body, obj: unknown) => {
      for (const field of fields) {
        const v = typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>)[field.name] : undefined;
        if (field.children !== null) walk(field.children, v);
        else
          next[field.key] = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
    };
    walk(form.body, value);
    setValues(next);
  };
  return (
    <Dropdown
      align="end"
      label="Examples"
      trigger={(props) => (
        <button type="button" className={styles.headerButton} {...props}>
          <span>Examples</span>
          <Icon name="chevron-down" className={styles.chevron} />
        </button>
      )}
    >
      {(close) => (
        <>
          {examples.map(([name, example]) => (
            <MenuItem
              key={name}
              onSelect={() => {
                apply(example.value);
                close();
              }}
            >
              {example.summary ?? name}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

function RequestCard() {
  const { language, library, setLibrary, snippet, tryIt, loading } = useEndpoint();
  const label = requestLabel(language, library);
  return (
    <div className={`${styles.requestCard} dp-rm-request-card`} data-visual="reqCard" data-visual-region="requestCard">
      <header className={styles.requestHeader}>
        <section className={styles.requestHeaderLeft}>
          {language.libraries.length > 1 ? (
            <Dropdown
              label="Library"
              popup="menu"
              // Live opens the library menu under the toggle's right end (tippy bottom-end; pixel harness).
              align="end"
              trigger={(props) => (
                <button type="button" className={styles.headerButton} title="Toggle library" {...props}>
                  <span>{label}</span>
                  <Icon name="chevron-down" className={styles.chevron} />
                </button>
              )}
            >
              {(close) => (
                <div data-visual-deviation={language.id === 'node' ? 'D-4' : undefined}>
                  <MenuHeader>Library</MenuHeader>
                  {language.libraries.map((l) => (
                    <MenuItem
                      key={l.id}
                      active={l.id === library.id}
                      onSelect={() => {
                        setLibrary(l.id);
                        close();
                      }}
                    >
                      {l.label}
                    </MenuItem>
                  ))}
                </div>
              )}
            </Dropdown>
          ) : (
            <span className={styles.requestTitle}>{label}</span>
          )}
        </section>
        <RequestExamples />
      </header>
      {/* D-4: Node's snippet is fetch here, ReadMe's `api` SDK on live. */}
      <div className={styles.requestCode} data-visual-deviation={language.id === 'node' ? 'D-4' : undefined}>
        <CodeView code={snippet} mode={language.mode} label={`${language.label} request sample`} />
      </div>
      <footer className={styles.requestFooter}>
        <div className={styles.requestFooterLeft}>
          <CopyButton text={snippet} className={styles.requestCopy} />
        </div>
        <button
          type="button"
          className={[styles.tryIt, loading ? styles.tryItLoading : ''].filter(Boolean).join(' ')}
          data-visual="tryIt"
          disabled={loading}
          aria-busy={loading}
          onClick={() => {
            void tryIt();
          }}
        >
          {loading ? <span className={styles.tryItSpinner} role="progressbar" aria-label="Loading…" /> : null}
          Try It!
        </button>
      </footer>
    </div>
  );
}

function StatusLabel({ status, name }: { status: string | number; name: string | null }) {
  return (
    <>
      <span className={styles.statusDot}>
        <StatusDot status={status} />
      </span>
      <span className={styles.statusText}>
        <span className={styles.statusCode}>{status}</span>
        {name !== null ? ` - ${name}` : ''}
      </span>
    </>
  );
}

function ResponseMenu({ view, trigger }: { view: ResponseView; trigger: ReactNode }) {
  const { examples, setResponse } = useEndpoint();
  const byMedia = new Map<string, typeof examples>();
  for (const e of examples) byMedia.set(e.mediaType, [...(byMedia.get(e.mediaType) ?? []), e]);
  return (
    <Dropdown
      label="Response examples"
      frameClassName={styles.responseMenuFrame}
      panelClassName={styles.responseMenu}
      trigger={(props) => (
        <button type="button" className={styles.statusButton} {...props}>
          {trigger}
          <Icon name="chevron-down" className={styles.chevron} />
        </button>
      )}
    >
      {(close) => (
        <>
          {[...byMedia.entries()].map(([mediaType, list]) => (
            <div key={mediaType} role="group" aria-label={mediaType}>
              <MenuHeader>{mediaType}</MenuHeader>
              {list.map((e) => (
                <MenuItem
                  key={e.id}
                  active={view.kind === 'example' && view.exampleId === e.id}
                  onSelect={() => {
                    setResponse({ kind: 'example', exampleId: e.id });
                    close();
                  }}
                >
                  <span className={styles.menuStatus}>
                    <StatusLabel status={e.status} name={e.name} />
                  </span>
                </MenuItem>
              ))}
            </div>
          ))}
          {examples.length > 0 ? <div className={styles.menuDivider} role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className={styles.clearItem}
            onClick={() => {
              setResponse({ kind: 'empty' });
              close();
            }}
          >
            {view.kind === 'result' ? 'Clear Response' : 'Clear Example'}
          </button>
        </>
      )}
    </Dropdown>
  );
}

function HeadersDialog({ view, onClose }: { view: Extract<ResponseView, { kind: 'result' }>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  const responseHeaders = view.result.ok ? view.result.headers : [];
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-visual-region="modal"
      aria-labelledby="dp-headers-title"
      onClose={onClose}
      onCancel={onClose}
    >
      <header className={styles.dialogHeader}>
        <h2 id="dp-headers-title" className={styles.dialogTitle}>
          Headers
        </h2>
        <button type="button" className={styles.dialogX} aria-label="Close" onClick={onClose}>
          <Icon name="x" className={styles.dialogXIcon} />
        </button>
      </header>
      <div className={styles.dialogBody}>
        <h3 className={styles.dialogSection}>Response</h3>
        {/* D-8: the browser exposes fewer response headers than ReadMe's proxy did. */}
        <dl className={styles.headerList} data-visual-deviation="D-8">
          {responseHeaders.map(([name, value]) => (
            <div key={name} className={styles.headerRow}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <h3 className={styles.dialogSection}>Request</h3>
        <dl className={styles.headerList}>
          {view.requestHeaders.map((h) => (
            <div key={h.name} className={styles.headerRow}>
              <dt>{h.name}</dt>
              <dd>{h.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <footer className={styles.dialogFooter}>
        <button type="button" className={styles.dialogClose} onClick={onClose}>
          Close
        </button>
      </footer>
    </dialog>
  );
}

const JSON_MODE = { name: 'javascript', json: true };

function ResponseCard() {
  const { response, examples, setResponse, announcement } = useEndpoint();
  const [headersOpen, setHeadersOpen] = useState(false);
  const headersButton = useRef<HTMLButtonElement | null>(null);
  const headersWereOpen = useRef(false);
  // The dialog is unmounted on close, so the browser cannot restore focus itself: once it is gone (the page is
  // no longer inert), return focus to the Headers button.
  useEffect(() => {
    if (headersOpen) headersWereOpen.current = true;
    else if (headersWereOpen.current) {
      headersWereOpen.current = false;
      headersButton.current?.focus();
    }
  }, [headersOpen]);
  const closeHeaders = () => setHeadersOpen(false);
  let header: ReactNode;
  let body: ReactNode;
  let copyText: string | null = null;
  if (response.kind === 'example') {
    const example = examples.find((e) => e.id === response.exampleId) ?? examples[0];
    if (example !== undefined) {
      copyText = example.text;
      header = <ResponseMenu view={response} trigger={<StatusLabel status={example.status} name={example.name} />} />;
      body = (
        <ResponseViewer
          text={example.text}
          mode={/json/.test(example.mediaType) ? JSON_MODE : null}
          label="Response example"
        />
      );
    }
  } else if (response.kind === 'result') {
    const { result } = response;
    if (result.ok) {
      const text = formatBody(result.bodyText, result.contentType);
      copyText = text;
      header = <ResponseMenu view={response} trigger={<StatusLabel status={result.status} name={null} />} />;
      const isJson = text.trimStart().startsWith('{') || text.trimStart().startsWith('[');
      body = <ResponseViewer text={text} mode={isJson ? JSON_MODE : null} label="Response body" />;
    } else {
      header = <ResponseMenu view={response} trigger={<StatusLabel status="Error" name={null} />} />;
      body = (
        <div className={styles.errorMessage}>
          <p>The request could not be completed.</p>
          <p className={styles.errorDetail}>{result.message}</p>
        </div>
      );
    }
  }
  if (header === undefined || body === undefined) {
    header = <div className={styles.responseTitle}>Response</div>;
    body = (
      <div className={styles.empty}>
        <div className={styles.emptyPrompt}>
          Click <code className={styles.emptyTryIt}>Try It!</code> to start a request and see the response here!
          {examples.length > 0 ? ' Or choose an example:' : ''}
        </div>
        {examples.length > 0 ? (
          <div className={styles.emptyExamples}>
            {[...new Set(examples.map((e) => e.mediaType))].map((mediaType) => (
              <div key={mediaType} className={styles.emptyGroup}>
                <div className={styles.emptyMedia}>{mediaType}</div>
                <div className={styles.emptyButtons}>
                  {examples
                    .filter((e) => e.mediaType === mediaType)
                    .map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={styles.emptyExample}
                        onClick={() => setResponse({ kind: 'example', exampleId: e.id })}
                      >
                        <StatusLabel status={e.status} name={e.name} />
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  const isViewer = response.kind === 'example' || (response.kind === 'result' && response.result.ok);
  return (
    <section
      className={[styles.responseCard, isViewer ? styles.responseCardViewer : ''].filter(Boolean).join(' ')}
      data-visual="respCard"
      data-visual-region="responseCard"
      aria-label="Response"
    >
      <header className={styles.responseHeader}>
        {header}
        <div className={styles.responseActions}>
          {response.kind === 'result' && response.result.ok ? (
            <button
              type="button"
              ref={headersButton}
              className={styles.headersButton}
              aria-haspopup="dialog"
              onClick={() => setHeadersOpen(true)}
            >
              Headers
              <Icon name="external-link" className={styles.headersIcon} />
            </button>
          ) : null}
          {copyText !== null ? <CopyButton text={copyText} className={styles.responseCopy} /> : null}
        </div>
      </header>
      <div className={styles.responseBody}>{body}</div>
      <div className={styles.liveRegion} aria-live="polite">
        {announcement}
      </div>
      {headersOpen && response.kind === 'result' ? <HeadersDialog view={response} onClose={closeHeaders} /> : null}
    </section>
  );
}

/** "Questions about this endpoint?" with the Discord button (D-3). W11 replaces the placeholder link. */
export function RequestPanelDiscord({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.questions} data-visual-deviation="D-3">
      <p className={styles.questionsText}>Questions about this endpoint?</p>
      {children ?? (
        <a
          className={styles.discordLink}
          href="https://sefaria.formstack.com/forms/sefaria_developer_discord_community"
          target="_blank"
          rel="noopener noreferrer"
          data-discord-placement="reference_request_panel"
        >
          Join our Discord
        </a>
      )}
    </div>
  );
}

export interface PlaygroundProps {
  /** The DiscordButton for placement `reference_request_panel` (W11); a plain link until then. */
  discordButton?: ReactNode;
}

export function Playground({ discordButton }: PlaygroundProps) {
  return (
    <div id="ReferencePlayground" className={`${styles.playground} dp-rm-playground`} data-visual="playground">
      <LanguagePicker />
      <section className={`${styles.section} ${styles.sticky}`}>
        <RequestCard />
        <ResponseCard />
        <RequestPanelDiscord>{discordButton}</RequestPanelDiscord>
      </section>
    </div>
  );
}
