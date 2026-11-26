export interface ChartNote {
  /** The year whose point on the "Projects over time" line carries the numbered marker. */
  year: number;
  text: string;
}

/**
 * Notes for the "Projects over time" chart, in order; markers are numbered from 1.
 * TODO(content): only the tracking note has been supplied. Add further
 * annotations here as { year, text } and they will be numbered automatically.
 */
export const CUMULATIVE_NOTES: readonly ChartNote[] = [
  {
    year: 2024,
    text: 'Tracking began March 2024. Earlier projects were added by hand, using their last commit or site date.',
  },
];
