// Layout shims ProseMirror needs under jsdom (it measures the caret to scroll it into view). Imported by the
// editor's DOM tests.
const empty = (): DOMRectList => {
  const list: DOMRect[] = [];
  return Object.assign(list, { item: (i: number) => list[i] ?? null }) as unknown as DOMRectList;
};
const rect = (): DOMRect => new DOMRect(0, 0, 0, 0);

if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= rect;
}
if (typeof Text !== 'undefined') {
  const text = Text.prototype as unknown as {
    getClientRects?: () => DOMRectList;
    getBoundingClientRect?: () => DOMRect;
  };
  text.getClientRects ??= empty;
  text.getBoundingClientRect ??= rect;
}
if (typeof document !== 'undefined') {
  document.elementFromPoint ??= () => null;
}

export {};
