/**
 * In running text (continuous layout) several short segments can begin on the same line, and their numbers would sit on
 * top of each other in the gutter. The old client moved them apart by their widths (placeSegmentNumbers); here the
 * later ones step outwards into the margin, so every number stays readable and next to the text it belongs to. Where the margin has
 * no room (a phone, whose gutter is the screen's edge) they step down within the gutter instead, never onto the text.
 *
 * @feature TXD-046 Segment number and dot positioning in continuous mode
 */
const STEP = 20;

export function spreadNumbers(root: HTMLElement): void {
  const nums = [...root.querySelectorAll<HTMLElement>('[data-layout="continuous"] [data-number]')];
  if (!nums.length) return;
  for (const n of nums) n.style.translate = "";
  const boxes = nums.map((n) => n.getBoundingClientRect());
  const tops = boxes.map((b) => b.top);
  // what each number may not leave: its column, and the page (on a phone the gutter is the screen's edge). A step that would leave it
  // goes down instead, one number's height per step, staying in the gutter: inwards it would sit on the text, outwards the page would
  // scroll sideways (parity S6)
  const page = root.ownerDocument.documentElement.clientWidth;
  const edges = nums.map((n) => {
    const r = (n.closest("[data-reader-scroller]") ?? root).getBoundingClientRect();
    return { left: Math.max(0, r.left), right: Math.min(page, r.right) };
  });
  const sign = getComputedStyle(nums[0]!).direction === "rtl" ? 1 : -1; // outwards: right in Hebrew, left otherwise
  let run = 0;
  nums.forEach((n, i) => {
    run = i > 0 && Math.abs(tops[i]! - tops[i - 1]!) < 2 ? run + 1 : 0;
    if (!run) return;
    const out = sign * run * STEP;
    const b = boxes[i]!, edge = edges[i]!;
    const fits = (out > 0 ? b.right + out <= edge.right + 0.5 : b.left + out >= edge.left - 0.5);
    n.style.translate = fits ? `${out}px 0` : `0 ${run * b.height}px`;
  });
}
