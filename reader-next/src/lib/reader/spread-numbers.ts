/**
 * In running text (continuous layout) several short segments can begin on the same line, and their numbers would sit on
 * top of each other in the gutter. The old client moved them apart by their widths (placeSegmentNumbers); here the
 * later ones step outwards into the margin, so every number stays readable and next to the text it belongs to.
 *
 * @feature TXD-046 Segment number and dot positioning in continuous mode
 */
const STEP = 20;

export function spreadNumbers(root: HTMLElement): void {
  const nums = [...root.querySelectorAll<HTMLElement>('[data-layout="continuous"] [data-number]')];
  if (!nums.length) return;
  for (const n of nums) n.style.translate = "";
  const tops = nums.map((n) => n.getBoundingClientRect().top);
  const sign = getComputedStyle(nums[0]!).direction === "rtl" ? 1 : -1; // outwards: right in Hebrew, left otherwise
  let run = 0;
  nums.forEach((n, i) => {
    run = i > 0 && Math.abs(tops[i]! - tops[i - 1]!) < 2 ? run + 1 : 0;
    if (run) n.style.translate = `${sign * run * STEP}px 0`;
  });
}
