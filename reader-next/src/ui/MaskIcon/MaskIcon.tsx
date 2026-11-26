import type { CSSProperties } from "react";
import styles from "./MaskIcon.module.css";

export interface MaskIconProps {
  /** An icon file under public/ (sefaria.org's own icons, copied from static/icons/), e.g. "/icons/heavy-x.svg". */
  src: string;
  /** Width and height in px. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * One of sefaria.org's icon files with the shape it has there, coloured by `color` (currentColor) instead of the file's fill, so a
 * token gives it its light and dark values. Decorative: hidden from assistive technology; the control around it carries the label.
 */
export function MaskIcon({ src, size = 18, className, style }: MaskIconProps) {
  return (
    <span
      aria-hidden="true"
      className={className ? `${styles.icon} ${className}` : styles.icon}
      style={{ ["--_src" as string]: `url("${src}")`, width: size, height: size, ...style }}
    />
  );
}
