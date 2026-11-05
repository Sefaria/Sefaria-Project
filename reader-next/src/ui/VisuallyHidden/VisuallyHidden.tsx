import type { ElementType, HTMLAttributes } from "react";

const style = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/** Content for assistive technology only (screen readers still announce it). */
export function VisuallyHidden({ as: Tag = "span", ...rest }: { as?: ElementType } & HTMLAttributes<HTMLElement>) {
  return <Tag style={style} {...rest} />;
}
