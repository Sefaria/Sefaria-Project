import type { SVGAttributes } from "react";

/**
 * Icon set. Paths are 24×24, stroke-based (currentColor) so they follow text colour and theme.
 * Add an icon here, with a story, rather than inlining SVG in a feature.
 */
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8",
  "chevron-left": "M15 5l-7 7 7 7",
  "chevron-right": "M9 5l7 7-7 7",
  "chevron-down": "M5 9l7 7 7-7",
  "chevron-up": "M5 15l7-7 7 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  "layout-segmented": "M5 5h14M5 9h14M5 14h14M5 18h14",
  "layout-continuous": "M5 7h14M5 10.5h14M5 14h14M5 17.5h9",
  "layout-stacked": "M5 5h14M5 9h14M5 15h10M5 19h10",
  "layout-he-left": "M4 5h7M4 9h7M4 13h7M4 17h7M14 7h6M14 11h6M14 15h6",
  "layout-he-right": "M13 5h7M13 9h7M13 13h7M13 17h7M4 7h6M4 11h6M4 15h6",
  "font-size": "M4 19l5-13 5 13M6 14h6M15 19l3-8 3 8M16 17h4",
  book: "M4 5.5C4 5 4.5 4.5 5 4.5h5.5c.8 0 1.5.7 1.5 1.5v13c0-.8-.7-1.5-1.5-1.5H5c-.5 0-1-.5-1-1zM20 5.5c0-.5-.5-1-1-1h-5.5c-.8 0-1.5.7-1.5 1.5v13c0-.8.7-1.5 1.5-1.5H19c.5 0 1-.5 1-1z",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  file: "M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5zM14 3.5v4h4",
  hash: "M9 4L7 20M17 4l-2 16M4 9h16M3.5 15h16",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  "circle-close": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6",
  "external-link": "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  translate: "M4 5h8M8 3v2M10 5c-.5 3-2.5 5.5-5.5 7M6.5 8.5c1 1.6 2.4 2.8 4 3.5M13 20l3.5-9 3.5 9M14.2 17h4.6",
  scroll: "M8 4h10a2 2 0 0 1 2 2v1h-4M8 4a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h10a2 2 0 0 0 2-2V7M8 4a2 2 0 0 1 2 2v1M9 11h5M9 14h5",
  audio: "M4 10h3l4-4v12l-4-4H4zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11",
  "file-plus": "M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5zM14 3.5v4h4M12 11v6M9 14h6",
  columns: "M4 5h16v14H4zM12 5v14",
  note: "M5 4h14v11l-5 5H5zM14 20v-5h5M8 9h8M8 12h5",
  share: "M8 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM21 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM21 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM7.7 10.9l8.6-3.8M7.7 13.1l8.6 3.8",
  message: "M4 5h16v11H9l-5 4z",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
  play: "M8 5l11 7-11 7z",
  pause: "M9 5v14M15 5v14",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  copy: "M9 9h10v11H9zM5 15V4h10",
  facebook: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z",
  "x-social": "M5 4l14 16M19 4L5 20",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-4 3.6-6 8-6s8 2 8 6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4M12 17h.01",
  grid: "M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01",
  "sort-arrows": "M7 4v16M7 4L4 7.5M7 4l3 3.5M17 20V4M17 20l-3-3.5M17 20l3-3.5",
  "circle-minus": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8",
  "circle-plus": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8M12 8v8",
  keyboard: "M3 6h18v12H3zM6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7 14h10",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
  pen: "M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3",
  school: "M3 9l9-4 9 4-9 4zM7 11v5c3 2 7 2 10 0v-5M21 9v6",
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/** Filled variants (the path is filled instead of stroked). */
const FILLED: ReadonlySet<IconName> = new Set<IconName>([]);

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "name"> {
  name: IconName;
  /** CSS size (px number or any length). Default 1.25em so it scales with surrounding text. */
  size?: number | string;
  /** Accessible name. Omit for decorative icons (hidden from assistive tech). */
  label?: string;
  /** Draw the path filled (for toggled states such as a saved bookmark). */
  filled?: boolean;
}

export function Icon({ name, size = "1.25em", label, filled, ...rest }: IconProps) {
  const fill = filled || FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
