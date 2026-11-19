// An endpoint page's content area: the article (headline, Recent Requests, parameters, responses) and the
// playground column, in live's layout (`SuperHubReference-article-container`). The shell (W2) renders the header,
// the sidebar and `main` around it and passes the Copy Page actions and the page footer in.
//
// The pieces are also exported separately for the shell's PortalFrame slots: wrap both slots in one
// <EndpointProvider> so the article's form and the playground share the request, then render <EndpointArticle> in
// `article#content` and <EndpointPlayground> in the playground column.
import type { ReactNode } from 'react';
import type { OperationSpec } from '../contracts';
import { Headline } from './article/Headline';
import { Params } from './article/Params';
import { RecentRequests } from './article/RecentRequests';
import { Responses } from './article/Responses';
import { Playground } from './playground/Playground';
import { EndpointContext, useEndpointState, type EndpointOptions } from './state';
import styles from './Endpoint.module.css';
import './code/code.css';

export interface EndpointProviderProps extends EndpointOptions {
  op: OperationSpec;
  children: ReactNode;
}

/** Holds the state the article and the playground share (form values, language, response, Recent Requests). */
export function EndpointProvider({ op, children, ...options }: EndpointProviderProps) {
  const state = useEndpointState(op, options);
  return <EndpointContext.Provider value={state}>{children}</EndpointContext.Provider>;
}

export interface EndpointArticleProps {
  /** `page.title` from the payload (title_override or the spec title); defaults to the spec title. */
  title: string;
  /** `page.descriptionHtml` from the payload; defaults to the spec description rendered here. */
  descriptionHtml?: string;
  /** The overlay's extra Markdown, rendered by the server (`page.bodyHtml`). */
  bodyHtml?: string;
  /** Copy Page split button (W2). */
  headerActions?: ReactNode;
  /**
   * "Updated N ago", prev/next and the feedback widget (W2), at the end of the article. Live shows it there while the
   * playground is beside the article; its stacked copy goes after the playground (`Endpoint stackedFooter`, or
   * PortalFrame `pageEnd`).
   */
  footer?: ReactNode;
}

/** The article column's content (inside `article#content`). Needs an <EndpointProvider> above it. */
export function EndpointArticle({ title, descriptionHtml, bodyHtml, headerActions, footer }: EndpointArticleProps) {
  return (
    <>
      <Headline title={title} descriptionHtml={descriptionHtml} actions={headerActions} />
      {bodyHtml !== undefined && bodyHtml !== '' ? (
        <div
          className={`${styles.body} dp-article`}
          // Rendered and sanitized by the server's Markdown pipeline (PLAN §2.6).
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : null}
      <RecentRequests />
      <Params />
      <Responses />
      {footer}
    </>
  );
}

export { Playground as EndpointPlayground };

export interface EndpointProps extends EndpointOptions, Omit<EndpointArticleProps, 'title'> {
  op: OperationSpec;
  title?: string;
  /** DiscordButton for `reference_request_panel` (W11). */
  discordButton?: ReactNode;
  /** The page footer's copy after the playground, shown once the columns stack (live's `Footer-mobile`). */
  stackedFooter?: ReactNode;
}

export function Endpoint({
  op,
  title,
  descriptionHtml,
  bodyHtml,
  headerActions,
  footer,
  discordButton,
  stackedFooter,
  ...options
}: EndpointProps) {
  return (
    <EndpointProvider op={op} {...options}>
      <div className={styles.wrapper} data-visual="articleWrap">
        <div className={styles.container}>
          <article
            id="content"
            className={styles.article}
            tabIndex={-1}
            data-visual="article"
            data-visual-region="article"
          >
            <EndpointArticle
              title={title ?? op.title}
              descriptionHtml={descriptionHtml}
              bodyHtml={bodyHtml}
              headerActions={headerActions}
              footer={footer}
            />
          </article>
          <Playground discordButton={discordButton} />
          {stackedFooter}
        </div>
      </div>
    </EndpointProvider>
  );
}
