import { useEffect } from 'react';

interface DocumentMeta {
  title: string;
  robots?: string;
  description?: string;
  /** Absolute canonical URL. */
  canonical?: string;
  /** For prerendering services that read it: the HTTP status the page should be served with. */
  status?: number;
}

/** Sets the title and any meta/link tags given, for the lifetime of the page. */
export function useDocumentMeta({ title, robots, description, canonical, status }: DocumentMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const added: HTMLElement[] = [];
    const replaced: Array<{ el: Element; content: string }> = [];
    const meta = (name: string, content: string) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (existing) {
        replaced.push({ el: existing, content: existing.content });
        existing.content = content;
        return;
      }
      const el = document.createElement('meta');
      el.name = name;
      el.content = content;
      document.head.appendChild(el);
      added.push(el);
    };
    if (robots) meta('robots', robots);
    if (description) meta('description', description);
    if (status) meta('prerender-status-code', String(status));
    if (canonical) {
      const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      const link = existing ?? document.createElement('link');
      if (existing) {
        replaced.push({ el: existing, content: existing.href });
      } else {
        link.rel = 'canonical';
        document.head.appendChild(link);
        added.push(link);
      }
      link.href = canonical;
    }
    return () => {
      document.title = previousTitle;
      added.forEach((el) => el.remove());
      for (const { el, content } of replaced) {
        if (el instanceof HTMLLinkElement) el.href = content;
        else (el as HTMLMetaElement).content = content;
      }
    };
  }, [title, robots, description, canonical, status]);
}
