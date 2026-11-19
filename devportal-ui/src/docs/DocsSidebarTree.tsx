// The docs sidebar's sections and tree (contract C3 sidebar tree; C6 SidebarCategory, SidebarLink,
// SidebarGroupToggle, DeprecatedMarker, ExternalLinkIcon). It renders inside the shell's sidebar frame
// (W2's `Sidebar`, nav "Secondary navigation"); page_doc.html renders the same markup on the server.
//
// Groups that contain the current page start open, as on live; every other group starts closed and
// its toggle reads "Show subpages for X". Link items open their target in a new tab when `newTab` is
// set and show the external arrow. Hidden pages never appear in the tree (C3), so nothing filters them.
import { useId, useState } from 'react';
import type { SidebarCategory, SidebarItem, SidebarTree } from '../contracts';
import { containsPath } from './sidebar';

export interface DocsSidebarTreeProps {
  tree: SidebarTree;
  /** The current page's path; its row is marked `aria-current="page"`. */
  activePath: string;
}

export function ExternalLinkIcon() {
  return (
    <svg
      className="dp-sidebar-external"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width="16"
      height="16"
    >
      <path d="M5 4h7v7M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Row({ item, activePath, depth }: { item: SidebarItem; activePath: string; depth: number }) {
  const hasChildren = item.children.length > 0;
  const [open, setOpen] = useState(() => hasChildren && containsPath(item, activePath));
  const listId = useId();
  const active = item.href === activePath;
  const external = item.kind === 'link';
  const linkClass = ['dp-sidebar-link', active ? 'dp-active' : '', depth > 0 ? 'dp-sidebar-link--sub' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <li className="dp-sidebar-item">
      <div
        className={[
          'dp-sidebar-row',
          hasChildren ? 'dp-sidebar-row--parent' : '',
          item.deprecated ? 'dp-sidebar-row--deprecated' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <a
          className={linkClass}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          target={external && item.newTab ? '_blank' : undefined}
          rel={external && item.newTab ? 'noopener noreferrer' : undefined}
        >
          <span className="dp-sidebar-link__text">{item.title}</span>
          {external && <ExternalLinkIcon />}
        </a>
        {item.deprecated && (
          <button type="button" className="dp-sidebar-deprecated" aria-label="Deprecated Doc" title="Deprecated" />
        )}
        {hasChildren && (
          <button
            type="button"
            className="dp-sidebar-toggle"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? 'Hide' : 'Show'} subpages for ${item.title}`}
            onClick={() => setOpen((o) => !o)}
          />
        )}
      </div>
      {hasChildren && (
        <ul id={listId} className="dp-sidebar-list dp-sidebar-list--sub" hidden={!open}>
          {item.children.map((child) => (
            <Row key={child.id} item={child} activePath={activePath} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Category({ category, activePath }: { category: SidebarCategory; activePath: string }) {
  const headingId = useId();
  return (
    <section className="dp-sidebar-section" aria-labelledby={headingId}>
      <h2 className="dp-sidebar-heading" id={headingId}>
        {category.title}
      </h2>
      <ul className="dp-sidebar-list">
        {category.items.map((item) => (
          <Row key={item.id} item={item} activePath={activePath} depth={0} />
        ))}
      </ul>
    </section>
  );
}

export function DocsSidebarTree({ tree, activePath }: DocsSidebarTreeProps) {
  return (
    <div className="dp-sidebar-tree">
      {tree.categories.map((category) => (
        <Category key={category.id} category={category} activePath={activePath} />
      ))}
    </div>
  );
}
