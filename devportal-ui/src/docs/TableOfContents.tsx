// The right-rail table of contents (contract C6 `TableOfContents`: nav "Table of Contents"). One entry
// per heading of level 1 to 3 outside callouts (DIALECT.md, Table of contents), indented by level as
// live's nested list is. page_doc.html renders the same markup on the server.
import { useEffect, useRef } from 'react';
import { attachScrollSpy, type ScrollSpyOptions } from './toc';

export interface TocItem {
  id: string;
  text: string;
  /** 1 to 3. Contract C3 types `level` as 2 | 3; live and the renderer also list H1. */
  level: number;
}

export const TOC_LABEL = 'Table of Contents';

export interface TableOfContentsProps {
  entries: TocItem[];
  spy?: ScrollSpyOptions;
}

export function TableOfContents({ entries, spy }: TableOfContentsProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return attachScrollSpy(ref.current, spy);
  }, [entries, spy]);
  if (entries.length === 0) return null;
  return (
    <nav className="dp-toc" aria-label={TOC_LABEL} ref={ref}>
      <ul className="dp-toc-list">
        {entries.map((entry, i) => (
          <li key={`${entry.id}-${i}`} className={`dp-toc-item dp-toc-item--h${Math.min(3, Math.max(1, entry.level))}`}>
            {/* An empty heading keeps its (empty) slot, as on live, but gets no link. */}
            {entry.id !== '' && (
              <a className="dp-toc-link" href={`#${entry.id}`}>
                {entry.text}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
