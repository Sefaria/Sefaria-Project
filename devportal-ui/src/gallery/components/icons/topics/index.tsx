import type { ReactNode } from 'react';
import { Scale } from 'lucide-react';

// Custom Jewish-topic icons, drawn in Lucide style (24 grid, 2px stroke, round
// caps and joins). Not used on cards yet; built for future topic filters.
// Not yet in Sefaria's icon library.

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function TopicSvg({ size = 24, strokeWidth = 2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Tanakh: a scroll on two rollers. */
export function TanakhIcon(props: IconProps) {
  return (
    <TopicSvg {...props}>
      <rect x="3" y="4" width="4" height="16" rx="2" />
      <rect x="17" y="4" width="4" height="16" rx="2" />
      <path d="M7 8h10M7 12h10M7 16h10" />
    </TopicSvg>
  );
}

/** Gemara: a page with a column of commentary. */
export function GemaraIcon(props: IconProps) {
  return (
    <TopicSvg {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M10 3v18M13.5 8H16M13.5 12H16M13.5 16H16" />
    </TopicSvg>
  );
}

/** Tefillah: a flame. */
export function TefillahIcon(props: IconProps) {
  return (
    <TopicSvg {...props}>
      <path d="M12 3c.5 3 5 5 5 9.5a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 1-2 1-5 1-8z" />
    </TopicSvg>
  );
}

/** Zmanim: the sun on the horizon. */
export function ZmanimIcon(props: IconProps) {
  return (
    <TopicSvg {...props}>
      <path d="M3 19h18M7 19a5 5 0 0 1 10 0M12 5v3M4.800 10.800l2 2M19.200 10.800l-2 2" />
    </TopicSvg>
  );
}

/** Kabbalah: linked nodes of the tree of life. */
export function KabbalahIcon(props: IconProps) {
  return (
    <TopicSvg {...props}>
      <circle cx="12" cy="4.500" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="12" cy="19.500" r="2" />
      <path d="M10.600 6 7.400 10.400M13.400 6l3.200 4.400M7.400 13.600l3.200 4.400M16.600 13.600 13.400 18" />
    </TopicSvg>
  );
}

/** Halakhah: Lucide's scale. */
export const HalakhaIcon = Scale;
