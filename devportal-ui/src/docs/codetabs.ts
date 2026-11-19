// Code-tab chrome (contract C6 `CodeTabs`): the renderer's
//   div.dp-codetabs > div.dp-codetabs-toolbar > button.dp-codetabs-tab + div.dp-codetabs-inner > pre.dp-pre
// becomes an ARIA tablist with one tabpanel per pre. Live has at most one tab per group in this corpus
// (DIALECT.md, F-4), but groups of several tabs work the same way.
import type { Cleanup } from './types';

let groupCounter = 0;

function select(tabs: HTMLButtonElement[], panels: HTMLElement[], index: number, focus: boolean): void {
  tabs.forEach((tab, i) => {
    const active = i === index;
    tab.classList.toggle('dp-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    const panel = panels[i];
    if (panel) panel.hidden = !active;
  });
  if (focus) tabs[index]?.focus();
}

export function enhanceCodeTabs(root: ParentNode): Cleanup {
  const cleanups: Cleanup[] = [];
  for (const group of root.querySelectorAll<HTMLElement>('.dp-codetabs')) {
    if (group.dataset.dpEnhanced === 'codetabs') continue;
    const toolbar = group.querySelector<HTMLElement>(':scope > .dp-codetabs-toolbar');
    const inner = group.querySelector<HTMLElement>(':scope > .dp-codetabs-inner');
    if (!toolbar || !inner) continue;
    const tabs = [...toolbar.querySelectorAll<HTMLButtonElement>(':scope > .dp-codetabs-tab')];
    const panels = [...inner.querySelectorAll<HTMLElement>(':scope > pre')];
    if (tabs.length === 0) continue;
    group.dataset.dpEnhanced = 'codetabs';
    const id = `dp-codetabs-${++groupCounter}`;
    toolbar.setAttribute('role', 'tablist');
    tabs.forEach((tab, i) => {
      tab.setAttribute('role', 'tab');
      tab.id = `${id}-tab-${i}`;
      const panel = panels[i];
      if (panel) {
        panel.id = `${id}-panel-${i}`;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        panel.tabIndex = 0;
        tab.setAttribute('aria-controls', panel.id);
      }
    });
    const initial = Math.max(
      0,
      tabs.findIndex((t) => t.classList.contains('dp-active'))
    );
    select(tabs, panels, initial, false);

    const onClick = (event: Event) => {
      const tab = (event.target as Element | null)?.closest<HTMLButtonElement>('.dp-codetabs-tab');
      const index = tab ? tabs.indexOf(tab) : -1;
      if (index >= 0) select(tabs, panels, index, false);
    };
    const onKey = (event: KeyboardEvent) => {
      const current = tabs.findIndex((t) => t === document.activeElement);
      if (current < 0) return;
      const targets: Record<string, number> = {
        ArrowRight: (current + 1) % tabs.length,
        ArrowLeft: (current - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      const next = targets[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs, panels, next, true);
    };
    toolbar.addEventListener('click', onClick);
    toolbar.addEventListener('keydown', onKey);
    cleanups.push(() => {
      toolbar.removeEventListener('click', onClick);
      toolbar.removeEventListener('keydown', onKey);
      delete group.dataset.dpEnhanced;
    });
  }
  return () => cleanups.forEach((c) => c());
}
