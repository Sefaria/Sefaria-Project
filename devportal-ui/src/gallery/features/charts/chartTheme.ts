/** Shared recharts styling, using our tokens. */
export const AXIS_TICK = {
  fontSize: 12,
  fill: 'var(--text-secondary)',
  fontFamily: 'var(--font-en-system)',
} as const;
export const AXIS_LINE = { stroke: 'var(--border-default)' } as const;
export const GRID_STROKE = 'var(--border-default)';
export const CHART_HEIGHT = 260;
export const BAR_FILL = 'var(--module-primary)';
export const BAR_FILL_HOVER = 'var(--brand-devportal-hover)';

/** "Mar 2024" -> "Mar '24". */
export function shortMonth(month: string): string {
  const [name, year] = month.split(' ');
  return `${name} '${(year ?? '').slice(2)}`;
}

/** 2026 -> "'26". */
export function shortYear(year: number): string {
  return `'${String(year).slice(2)}`;
}
