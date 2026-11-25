/**
 * A page that sets the document's font size (pioneers.html: `html { font-size: 10px }`) and sizes its content in rem: in this shell
 * the document is not the page's, so its rems are made pixels of that size. A page that does not set it keeps its rems (the old
 * document's 16px is this client's too).
 */
export function remToPx(css: string): string {
  const root = /(?:^|[}\s])html\s*\{[^}]*?font-size:\s*([\d.]+)px/i.exec(css);
  if (!root) return css;
  const px = Number(root[1]);
  return css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n: string) => `${Math.round(Number(n) * px * 1000) / 1000}px`);
}
